/*  wmf2png.exe — conversor WMF/EMF → PNG autocontido (LABELO/PUCRS)
 *
 *  Substitui o servidor HTTP (porta 3722) + PowerShell -EncodedCommand,
 *  que eram bloqueados por antivírus/ConstrainedLanguage em alguns PCs.
 *  Este executável compilado roda direto, sem porta e sem PowerShell.
 *
 *  Uso:  wmf2png.exe <entrada.wmf> <saida.png>
 *  Saída: código 0 = ok; 1 = erro de conversão; 2 = argumentos inválidos.
 *
 *  Compilar:
 *    C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe ^
 *      /nologo /target:exe /platform:x64 /optimize+ ^
 *      /reference:System.Drawing.dll ^
 *      /out:bin\wmf2png.exe tools\wmf2png\wmf2png.cs
 */
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Drawing.Drawing2D;

static class Wmf2Png
{
    static int Main(string[] args)
    {
        if (args.Length < 2)
        {
            Console.Error.WriteLine("uso: wmf2png.exe <entrada.wmf> <saida.png>");
            return 2;
        }

        string inPath  = args[0];
        string outPath = args[1];

        try
        {
            using (var mf = new Metafile(inPath))
            {
                MetafileHeader header = mf.GetMetafileHeader();
                float dpiX = header.DpiX > 0 ? header.DpiX : 96f;
                float dpiY = header.DpiY > 0 ? header.DpiY : 96f;

                int w = mf.Width;
                int h = mf.Height;
                if (w < 10 || h < 10) { w = 800; h = 600; }

                // Escala vetorial para PNG nítido (alvo ~1600 px de largura, teto 4x).
                const int target = 1600;
                float scale = w < target ? (float)target / w : 1f;
                if (scale > 4f) scale = 4f;

                int rw = (int)Math.Round(w * scale);
                int rh = (int)Math.Round(h * scale);

                using (var bmp = new Bitmap(rw, rh, PixelFormat.Format32bppArgb))
                {
                    bmp.SetResolution(dpiX, dpiY);
                    using (var g = Graphics.FromImage(bmp))
                    {
                        g.Clear(Color.White);
                        g.SmoothingMode     = SmoothingMode.HighQuality;
                        g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                        g.PixelOffsetMode   = PixelOffsetMode.HighQuality;
                        g.DrawImage(mf, new Rectangle(0, 0, rw, rh));
                    }
                    bmp.Save(outPath, ImageFormat.Png);
                }
            }
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 1;
        }
    }
}
