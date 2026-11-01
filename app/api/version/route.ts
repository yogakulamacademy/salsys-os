import { NextResponse } from 'next/server';

import {
  SALSYSOS_RELEASE,
  SALSYSOS_RELEASE_DATE,
  SALSYSOS_VERSION,
} from '@/lib/product-version';

export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json({
    product: 'SalsysOS',
    version: SALSYSOS_VERSION,
    release: SALSYSOS_RELEASE,
    release_date: SALSYSOS_RELEASE_DATE,
  });
}
