'use strict'

const { execSync } = require('child_process')
const forge = require('node-forge')
const { plainAddPlaceholder } = require('@signpdf/placeholder-plain')
const { SignPdf, Signer } = require('@signpdf/signpdf')

/**
 * Lista certificados com chave privada disponíveis no Windows Certificate Store.
 * Retorna array de { subject, thumbprint, notAfter, issuer }
 */
function listSigningCerts() {
  try {
    const lines = [
      '$certs = @(Get-ChildItem Cert:\\CurrentUser\\My | Where-Object { $_.HasPrivateKey -and $_.NotAfter -gt (Get-Date) })',
      'if ($certs.Count -eq 0) { Write-Output "[]"; exit }',
      '$arr = $certs | ForEach-Object { [pscustomobject]@{ subject=$_.Subject; thumbprint=$_.Thumbprint; notAfter=$_.NotAfter.ToString("yyyy-MM-dd"); issuer=$_.Issuer } }',
      'ConvertTo-Json -InputObject @($arr) -Compress',
    ]
    const out = execSync(
      `powershell -NoProfile -Command "${lines.join('; ')}"`,
      { encoding: 'utf8', timeout: 10000 }
    ).trim()
    if (!out) return []
    return JSON.parse(out)
  } catch {
    return []
  }
}

/**
 * Obtém o DER do certificado pelo thumbprint (Windows Cert Store).
 */
function getCertDer(thumbprint) {
  const script = `$c = Get-Item 'Cert:\\CurrentUser\\My\\${thumbprint}'; [Convert]::ToBase64String($c.RawData)`
  const out = execSync(
    `powershell -NoProfile -Command "${script}"`,
    { encoding: 'utf8', timeout: 10000 }
  ).trim()
  return Buffer.from(out, 'base64')
}

/**
 * Assina um hash SHA-256 usando a chave privada do certificado via Windows CNG.
 * Funciona com tokens A3 software — a chave nunca sai do token.
 */
function signHashWithWindowsCNG(thumbprint, hashBase64) {
  const script = [
    `$cert = Get-Item 'Cert:\\CurrentUser\\My\\${thumbprint}'`,
    `$rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)`,
    `$hash = [Convert]::FromBase64String('${hashBase64}')`,
    `$sig = $rsa.SignHash($hash, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)`,
    `[Convert]::ToBase64String($sig)`,
  ].join('; ')
  const out = execSync(
    `powershell -NoProfile -Command "${script}"`,
    { encoding: 'utf8', timeout: 30000 }
  ).trim()
  return Buffer.from(out, 'base64')
}

class WindowsCNGSigner extends Signer {
  constructor(thumbprint) {
    super()
    this.thumbprint = thumbprint
  }

  async sign(pdfBuffer, signingTime) {
    const thumbprint = this.thumbprint

    // Obtém o certificado do Windows Certificate Store
    const certDer = getCertDer(thumbprint)
    const certForge = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(certDer))
    )

    // Chave proxy: delega a operação RSA ao Windows CNG (o token nunca expõe a chave privada)
    const proxyKey = {
      sign: function(md) {
        const hashBytes = md.digest().bytes()
        const hashBase64 = Buffer.from(hashBytes, 'binary').toString('base64')
        const sigBuffer = signHashWithWindowsCNG(thumbprint, hashBase64)
        return sigBuffer.toString('binary')
      }
    }

    // Monta o PKCS#7 / CMS SignedData usando node-forge
    const p7 = forge.pkcs7.createSignedData()
    p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'))
    p7.addCertificate(certForge)
    p7.addSigner({
      key: proxyKey,
      certificate: certForge,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.signingTime, value: signingTime || new Date() },
        { type: forge.pki.oids.messageDigest },
      ],
    })
    p7.sign({ detached: true })

    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary')
  }
}

/* ─── Assinatura via arquivo .pfx (PKCS#12) — sem depender do Windows Store ──
   Lê o .pfx + senha com node-forge, extrai chave privada + cadeia e assina.
   Ideal para usar em vários PCs sem importar o certificado em cada Windows. */

function loadPfx(pfxBuffer, password) {
  const p12Der  = forge.util.createBuffer(pfxBuffer.toString('binary'))
  const p12Asn1 = forge.asn1.fromDer(p12Der)
  const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)

  // chave privada (shrouded ou não)
  let keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] || []
  if (!keyBags.length) keyBags = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] || []
  const privateKey = keyBags[0] && keyBags[0].key
  if (!privateKey) throw new Error('Chave privada não encontrada no .pfx (senha correta?).')

  // certificados (cadeia)
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] || []
  const certs = certBags.map(b => b.cert).filter(Boolean)
  if (!certs.length) throw new Error('Certificado não encontrado no .pfx.')

  // folha = certificado cuja chave pública casa com a chave privada
  const leaf = certs.find(c => c.publicKey && c.publicKey.n && privateKey.n && c.publicKey.n.equals(privateKey.n)) || certs[0]
  return { privateKey, certs, leaf }
}

class PfxSigner extends Signer {
  constructor(pfxBuffer, password) {
    super()
    const { privateKey, certs, leaf } = loadPfx(pfxBuffer, password)
    this.privateKey = privateKey
    this.certs = certs
    this.cert = leaf
  }
  async sign(pdfBuffer, signingTime) {
    const p7 = forge.pkcs7.createSignedData()
    p7.content = forge.util.createBuffer(pdfBuffer.toString('binary'))
    for (const c of this.certs) p7.addCertificate(c)
    p7.addSigner({
      key: this.privateKey,
      certificate: this.cert,
      digestAlgorithm: forge.pki.oids.sha256,
      authenticatedAttributes: [
        { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
        { type: forge.pki.oids.signingTime, value: signingTime || new Date() },
        { type: forge.pki.oids.messageDigest },
      ],
    })
    p7.sign({ detached: true })
    return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary')
  }
}

/** Valida o .pfx + senha e devolve dados do certificado (para a tela de Configurações). */
function validatePfx(pfxBuffer, password) {
  const { leaf } = loadPfx(pfxBuffer, password)
  const subject = leaf.subject.attributes.map(a => `${a.shortName || a.name}=${a.value}`).join(', ')
  const notAfter = leaf.validity.notAfter
  return { ok: true, subject, notAfter: notAfter.toISOString().slice(0, 10) }
}

/** Assina um Buffer PDF usando um arquivo .pfx + senha. */
async function signPDFWithPfx(pdfBuffer, pfxBuffer, password) {
  const pdfWithPlaceholder = plainAddPlaceholder({
    pdfBuffer,
    reason: 'Relatório CISPR 15 — LABELO/PUCRS',
    contactInfo: 'labelo@pucrs.br',
    name: 'LABELO/PUCRS',
    location: 'Porto Alegre, RS, Brasil',
    signatureLength: 16384,
  })
  const signed = await new SignPdf().sign(pdfWithPlaceholder, new PfxSigner(pfxBuffer, password))
  return Buffer.from(signed)
}

/**
 * Assina um Buffer PDF usando o certificado identificado pelo thumbprint.
 * Retorna Buffer do PDF assinado.
 */
async function signPDF(pdfBuffer, thumbprint) {
  const pdfWithPlaceholder = plainAddPlaceholder({
    pdfBuffer,
    reason: 'Relatório CISPR 15 — LABELO/PUCRS',
    contactInfo: 'labelo@pucrs.br',
    name: 'LABELO/PUCRS',
    location: 'Porto Alegre, RS, Brasil',
    signatureLength: 16384, // 8 KB para comportar certificados A3 com cadeia completa
  })

  const signed = await new SignPdf().sign(pdfWithPlaceholder, new WindowsCNGSigner(thumbprint))
  return Buffer.from(signed)
}

module.exports = { listSigningCerts, signPDF, signPDFWithPfx, validatePfx }
