import { NextRequest, NextResponse } from 'next/server'
import { readSettings, writeSettings } from '@/lib/settings-server'

export async function GET() {
  return NextResponse.json(readSettings())
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const updated = writeSettings(body)
    return NextResponse.json(updated)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
