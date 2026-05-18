// Writes a minimal uncompressed GeoTIFF (RGB, EPSG:4326) from the map canvas.
// Binary layout: TIFF header → 13-entry IFD → extra tag data → pixel rows.

function writeUint16LE(view, off, v) { view.setUint16(off, v, true); return off + 2 }
function writeUint32LE(view, off, v) { view.setUint32(off, v, true); return off + 4 }
function writeFloat64LE(view, off, v) { view.setFloat64(off, v, true); return off + 8 }

// Write one IFD entry (12 bytes): tag, type, count, value/offset
function ifdEntry(view, off, tag, type, count, val) {
  writeUint16LE(view, off,     tag)
  writeUint16LE(view, off + 2, type)
  writeUint32LE(view, off + 4, count)
  writeUint32LE(view, off + 8, val)
  return off + 12
}

function buildGeotiff4326(width, height, rgb, west, north, east, south) {
  const NUM_IFD = 13

  // Extra data blocks appended after IFD (all offsets from file start)
  const HEADER_SIZE  = 8
  const IFD_SIZE     = 2 + NUM_IFD * 12 + 4  // entry count + entries + next-IFD ptr
  const IFD_OFFSET   = HEADER_SIZE

  // Extra values that don't fit in 4-byte IFD value field
  const BPS_OFFSET   = IFD_OFFSET + IFD_SIZE              // 3× uint16 (BitsPerSample 8,8,8)
  const BPS_SIZE     = 6
  const SCALE_OFFSET = BPS_OFFSET + BPS_SIZE               // 3× float64 (ModelPixelScale)
  const SCALE_SIZE   = 24
  const TIE_OFFSET   = SCALE_OFFSET + SCALE_SIZE           // 6× float64 (ModelTiepoint)
  const TIE_SIZE     = 48
  const GKD_OFFSET   = TIE_OFFSET + TIE_SIZE               // 4× uint16 × 4 GeoKeys
  const GKD_SIZE     = 32  // 2 header shorts + 4 keys × 4 shorts each = 2+32 = 34 → pad to 36
  const DATA_OFFSET  = GKD_OFFSET + 36                     // pixel data start

  const pixelCount   = width * height
  const totalSize    = DATA_OFFSET + pixelCount * 3

  const buf  = new ArrayBuffer(totalSize)
  const view = new DataView(buf)
  const u8   = new Uint8Array(buf)

  // ── TIFF header ─────────────────────────────────────────────────────────────
  view.setUint16(0, 0x4949, true)   // 'II' little-endian
  view.setUint16(2, 42,     true)   // magic
  view.setUint32(4, IFD_OFFSET, true)

  // ── IFD ─────────────────────────────────────────────────────────────────────
  let p = IFD_OFFSET
  view.setUint16(p, NUM_IFD, true); p += 2

  // TIFF_TYPE codes: SHORT=3, LONG=4, RATIONAL=5, DOUBLE=12
  p = ifdEntry(view, p, 256, 4, 1, width)                       // ImageWidth
  p = ifdEntry(view, p, 257, 4, 1, height)                      // ImageLength
  p = ifdEntry(view, p, 258, 3, 3, BPS_OFFSET)                  // BitsPerSample (offset)
  p = ifdEntry(view, p, 259, 3, 1, 1)                           // Compression: none
  p = ifdEntry(view, p, 262, 3, 1, 2)                           // PhotometricInterpretation: RGB
  p = ifdEntry(view, p, 278, 4, 1, height)                      // RowsPerStrip: entire image
  p = ifdEntry(view, p, 279, 4, 1, pixelCount * 3)              // StripByteCounts
  p = ifdEntry(view, p, 273, 4, 1, DATA_OFFSET)                 // StripOffsets
  p = ifdEntry(view, p, 277, 3, 1, 3)                           // SamplesPerPixel: 3
  p = ifdEntry(view, p, 284, 3, 1, 1)                           // PlanarConfiguration: chunky
  // GeoTIFF tags
  p = ifdEntry(view, p, 33550, 12, 3, SCALE_OFFSET)             // ModelPixelScaleTag (doubles)
  p = ifdEntry(view, p, 33922, 12, 6, TIE_OFFSET)               // ModelTiepointTag (doubles)
  p = ifdEntry(view, p, 34736, 3, 16, GKD_OFFSET)               // GeoKeyDirectoryTag
  view.setUint32(p, 0, true)  // next IFD offset = 0 (last IFD)
  p += 4

  // ── BitsPerSample extra data: [8, 8, 8] ─────────────────────────────────────
  view.setUint16(BPS_OFFSET,     8, true)
  view.setUint16(BPS_OFFSET + 2, 8, true)
  view.setUint16(BPS_OFFSET + 4, 8, true)

  // ── ModelPixelScaleTag: [scaleX, scaleY, 0] ─────────────────────────────────
  const scaleX = (east  - west)  / width
  const scaleY = (north - south) / height
  writeFloat64LE(view, SCALE_OFFSET,      scaleX)
  writeFloat64LE(view, SCALE_OFFSET +  8, scaleY)
  writeFloat64LE(view, SCALE_OFFSET + 16, 0)

  // ── ModelTiepointTag: [pixI, pixJ, pixK, easting, northing, altitude] ───────
  // Tie top-left pixel corner to geographic coords
  writeFloat64LE(view, TIE_OFFSET,      0)
  writeFloat64LE(view, TIE_OFFSET +  8, 0)
  writeFloat64LE(view, TIE_OFFSET + 16, 0)
  writeFloat64LE(view, TIE_OFFSET + 24, west)
  writeFloat64LE(view, TIE_OFFSET + 32, north)
  writeFloat64LE(view, TIE_OFFSET + 40, 0)

  // ── GeoKeyDirectory: 4 GeoKeys ──────────────────────────────────────────────
  // Header: [KeyDirectoryVersion=1, KeyRevision=1, MinorRevision=0, NumberOfKeys=4]
  let gp = GKD_OFFSET
  const setGKS = (v) => { view.setUint16(gp, v, true); gp += 2 }
  setGKS(1); setGKS(1); setGKS(0); setGKS(4)
  // GTModelTypeGeoKey=1024 → 2 (ModelTypeGeographic)
  setGKS(1024); setGKS(0); setGKS(1); setGKS(2)
  // GTRasterTypeGeoKey=1025 → 1 (RasterPixelIsArea)
  setGKS(1025); setGKS(0); setGKS(1); setGKS(1)
  // GeographicTypeGeoKey=2048 → 4326 (GCS_WGS_84)
  setGKS(2048); setGKS(0); setGKS(1); setGKS(4326)
  // GeogAngularUnitsGeoKey=2054 → 9102 (Angular_Degree)
  setGKS(2054); setGKS(0); setGKS(1); setGKS(9102)

  // ── Pixel data (RGB, top-to-bottom, left-to-right) ──────────────────────────
  for (let i = 0; i < pixelCount; i++) {
    u8[DATA_OFFSET + i * 3]     = rgb[i * 3]
    u8[DATA_OFFSET + i * 3 + 1] = rgb[i * 3 + 1]
    u8[DATA_OFFSET + i * 3 + 2] = rgb[i * 3 + 2]
  }

  return buf
}

function fmtCoord(deg, posLetter, negLetter) {
  const letter = deg >= 0 ? posLetter : negLetter
  return Math.abs(deg).toFixed(4) + letter
}

export async function exportGeotiff(map, styleName = 'map') {
  const bounds = map.getBounds()
  const west  = bounds.getWest()
  const east  = bounds.getEast()
  const north = bounds.getNorth()
  const south = bounds.getSouth()

  // Force a render so the canvas is up-to-date
  map.triggerRepaint()
  await new Promise(resolve => map.once('render', resolve))

  // Copy WebGL canvas → 2D canvas → ImageData
  const src = map.getCanvas()
  const w = src.width, h = src.height
  const c2d = document.createElement('canvas')
  c2d.width = w; c2d.height = h
  const ctx = c2d.getContext('2d')
  ctx.drawImage(src, 0, 0)
  const imgData = ctx.getImageData(0, 0, w, h)

  // Convert RGBA → RGB
  const rgb = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3]     = imgData.data[i * 4]
    rgb[i * 3 + 1] = imgData.data[i * 4 + 1]
    rgb[i * 3 + 2] = imgData.data[i * 4 + 2]
  }

  const buf = buildGeotiff4326(w, h, rgb, west, north, east, south)

  // e.g. liberty_45.2300N122.4500W_12.3400S80.1200E_alt4250m.tif
  const nwLat = fmtCoord(north, 'N', 'S')
  const nwLon = fmtCoord(west,  'E', 'W')
  const seLat = fmtCoord(south, 'N', 'S')
  const seLon = fmtCoord(east,  'E', 'W')
  const rawAlt  = map.getCameraAltitude?.()
  const elevStr = rawAlt != null
    ? `_alt${Math.round(rawAlt)}m`
    : `_z${Math.round(map.getZoom())}`
  const safeStyle = styleName.replace(/[^a-z0-9_-]/gi, '_')
  const filename = `${safeStyle}_${nwLat}${nwLon}_${seLat}${seLon}${elevStr}.tif`

  const blob = new Blob([buf], { type: 'image/tiff' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
