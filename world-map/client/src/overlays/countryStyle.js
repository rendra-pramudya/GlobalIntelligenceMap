import { feature } from 'topojson-client'

const TOPO_URL   = '/countries-10m.json'
const STORAGE_KEY = 'wm_country_styles'
const SRC        = 'wm-country-src'
const FILL_ID    = 'wm-country-fill'
const LINE_ID    = 'wm-country-line'
const LABEL_ID   = 'wm-country-label'

// ISO 3166-1 numeric id → { iso: alpha3, name }
const ISO_MAP = (() => {
  const raw = {
    4:"AFG:Afghanistan",8:"ALB:Albania",12:"DZA:Algeria",20:"AND:Andorra",
    24:"AGO:Angola",28:"ATG:Antigua and Barbuda",32:"ARG:Argentina",
    36:"AUS:Australia",40:"AUT:Austria",44:"BHS:Bahamas",48:"BHR:Bahrain",
    50:"BGD:Bangladesh",52:"BRB:Barbados",56:"BEL:Belgium",64:"BTN:Bhutan",
    68:"BOL:Bolivia",70:"BIH:Bosnia and Herzegovina",72:"BWA:Botswana",
    76:"BRA:Brazil",84:"BLZ:Belize",90:"SLB:Solomon Islands",96:"BRN:Brunei",
    100:"BGR:Bulgaria",104:"MMR:Myanmar",108:"BDI:Burundi",112:"BLR:Belarus",
    116:"KHM:Cambodia",120:"CMR:Cameroon",124:"CAN:Canada",132:"CPV:Cape Verde",
    140:"CAF:Central African Republic",144:"LKA:Sri Lanka",148:"TCD:Chad",
    152:"CHL:Chile",156:"CHN:China",158:"TWN:Taiwan",170:"COL:Colombia",
    174:"COM:Comoros",178:"COG:Republic of the Congo",180:"COD:DR Congo",
    188:"CRI:Costa Rica",191:"HRV:Croatia",192:"CUB:Cuba",196:"CYP:Cyprus",
    203:"CZE:Czechia",204:"BEN:Benin",208:"DNK:Denmark",212:"DMA:Dominica",
    214:"DOM:Dominican Republic",218:"ECU:Ecuador",222:"SLV:El Salvador",
    226:"GNQ:Equatorial Guinea",231:"ETH:Ethiopia",232:"ERI:Eritrea",
    233:"EST:Estonia",238:"FLK:Falkland Islands",242:"FJI:Fiji",
    246:"FIN:Finland",250:"FRA:France",266:"GAB:Gabon",268:"GEO:Georgia",
    276:"DEU:Germany",288:"GHA:Ghana",300:"GRC:Greece",308:"GRD:Grenada",
    320:"GTM:Guatemala",324:"GIN:Guinea",328:"GUY:Guyana",332:"HTI:Haiti",
    336:"VAT:Vatican",340:"HND:Honduras",344:"HKG:Hong Kong",
    348:"HUN:Hungary",356:"IND:India",360:"IDN:Indonesia",364:"IRN:Iran",
    368:"IRQ:Iraq",372:"IRL:Ireland",376:"ISR:Israel",380:"ITA:Italy",
    388:"JAM:Jamaica",392:"JPN:Japan",400:"JOR:Jordan",398:"KAZ:Kazakhstan",
    404:"KEN:Kenya",408:"PRK:North Korea",410:"KOR:South Korea",
    414:"KWT:Kuwait",417:"KGZ:Kyrgyzstan",418:"LAO:Laos",422:"LBN:Lebanon",
    426:"LSO:Lesotho",428:"LVA:Latvia",430:"LBR:Liberia",434:"LBY:Libya",
    438:"LIE:Liechtenstein",440:"LTU:Lithuania",442:"LUX:Luxembourg",
    450:"MDG:Madagascar",454:"MWI:Malawi",458:"MYS:Malaysia",
    462:"MDV:Maldives",466:"MLI:Mali",470:"MLT:Malta",478:"MRT:Mauritania",
    480:"MUS:Mauritius",484:"MEX:Mexico",496:"MNG:Mongolia",498:"MDA:Moldova",
    499:"MNE:Montenegro",504:"MAR:Morocco",508:"MOZ:Mozambique",
    516:"NAM:Namibia",524:"NPL:Nepal",528:"NLD:Netherlands",
    554:"NZL:New Zealand",558:"NIC:Nicaragua",562:"NER:Niger",
    566:"NGA:Nigeria",578:"NOR:Norway",512:"OMN:Oman",586:"PAK:Pakistan",
    591:"PAN:Panama",598:"PNG:Papua New Guinea",600:"PRY:Paraguay",
    604:"PER:Peru",608:"PHL:Philippines",616:"POL:Poland",620:"PRT:Portugal",
    630:"PRI:Puerto Rico",634:"QAT:Qatar",642:"ROU:Romania",643:"RUS:Russia",
    646:"RWA:Rwanda",659:"KNA:Saint Kitts and Nevis",662:"LCA:Saint Lucia",
    670:"VCT:Saint Vincent and the Grenadines",682:"SAU:Saudi Arabia",
    686:"SEN:Senegal",694:"SLE:Sierra Leone",703:"SVK:Slovakia",
    705:"SVN:Slovenia",706:"SOM:Somalia",710:"ZAF:South Africa",
    716:"ZWE:Zimbabwe",724:"ESP:Spain",728:"SSD:South Sudan",
    729:"SDN:Sudan",740:"SUR:Suriname",748:"SWZ:Eswatini",
    752:"SWE:Sweden",756:"CHE:Switzerland",760:"SYR:Syria",
    762:"TJK:Tajikistan",764:"THA:Thailand",768:"TGO:Togo",
    776:"TON:Tonga",780:"TTO:Trinidad and Tobago",788:"TUN:Tunisia",
    792:"TUR:Turkey",795:"TKM:Turkmenistan",800:"UGA:Uganda",
    804:"UKR:Ukraine",784:"ARE:United Arab Emirates",
    826:"GBR:United Kingdom",840:"USA:United States",
    858:"URY:Uruguay",860:"UZB:Uzbekistan",862:"VEN:Venezuela",
    704:"VNM:Vietnam",882:"WSM:Samoa",887:"YEM:Yemen",
    894:"ZMB:Zambia",275:"PSE:Palestine",31:"AZE:Azerbaijan",
    51:"ARM:Armenia",548:"VUT:Vanuatu",296:"KIR:Kiribati",
    584:"MHL:Marshall Islands",583:"FSM:Micronesia",585:"PLW:Palau",
    520:"NRU:Nauru",798:"TUV:Tuvalu",807:"MKD:North Macedonia",
    688:"SRB:Serbia",674:"SMR:San Marino",678:"STP:São Tomé and Príncipe",
    10:"ATA:Antarctica",
  }
  const m = new Map()
  for (const [k, v] of Object.entries(raw)) {
    const i = v.indexOf(':')
    m.set(Number(k), { iso: v.slice(0, i), name: v.slice(i + 1) })
  }
  return m
})()

function toGeoJSON(topo) {
  const coll = feature(topo, topo.objects.countries)
  coll.features.forEach(f => {
    const entry = ISO_MAP.get(Number(f.id))
    f.properties = entry
      ? { ISO_A3: entry.iso, ADMIN: entry.name, NAME: entry.name }
      : { ISO_A3: '-99',    ADMIN: 'Unknown',   NAME: 'Unknown'  }
  })
  return coll
}

export function initCountryStyle(map) {
  let styles      = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  let selectedISO = null
  let geoData     = null
  let enabled     = false
  let _onchange   = null
  let _onselect   = null

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(styles))
  }

  function buildFillColor() {
    const merged = { ...styles }
    if (selectedISO) merged[selectedISO] = { ...merged[selectedISO], color: '#6699ff', opacity: merged[selectedISO]?.opacity ?? 0.25 }
    const entries = Object.entries(merged)
    if (!entries.length) return 'transparent'
    return ['match', ['get', 'ISO_A3'], ...entries.flatMap(([iso, s]) => [iso, s.color]), 'transparent']
  }

  function buildFillOpacity() {
    const merged = { ...styles }
    if (selectedISO) merged[selectedISO] = { color: merged[selectedISO]?.color ?? '#6699ff', opacity: 0.25 }
    const entries = Object.entries(merged)
    if (!entries.length) return 0
    return ['match', ['get', 'ISO_A3'], ...entries.flatMap(([iso, s]) => [iso, s.opacity ?? 0.4]), 0]
  }

  function buildLineColor() {
    if (!selectedISO) return '#ffffff'
    return ['case', ['==', ['get', 'ISO_A3'], selectedISO], '#4488ff', '#ffffff']
  }

  function buildLineWidth() {
    if (!selectedISO) return 0.5
    return ['case', ['==', ['get', 'ISO_A3'], selectedISO], 2.5, 0.5]
  }

  function buildLineOpacity() {
    const entries = Object.entries(styles)
    const base = entries.length
      ? ['match', ['get', 'ISO_A3'], ...entries.flatMap(([iso]) => [iso, 0.85]), 0]
      : 0
    if (!selectedISO) return base
    return ['case', ['==', ['get', 'ISO_A3'], selectedISO], 1, base]
  }

  function buildLabelFilter() {
    const isos = new Set(Object.keys(styles))
    if (selectedISO) isos.add(selectedISO)
    if (!isos.size) return ['==', 'ISO_A3', '__none__']
    return ['in', ['get', 'ISO_A3'], ['literal', [...isos]]]
  }

  function updatePaint() {
    if (!map.getLayer(FILL_ID)) return
    map.setPaintProperty(FILL_ID, 'fill-color',   buildFillColor())
    map.setPaintProperty(FILL_ID, 'fill-opacity',  buildFillOpacity())
    map.setPaintProperty(LINE_ID, 'line-color',    buildLineColor())
    map.setPaintProperty(LINE_ID, 'line-width',    buildLineWidth())
    map.setPaintProperty(LINE_ID, 'line-opacity',  buildLineOpacity())
    if (map.getLayer(LABEL_ID)) map.setFilter(LABEL_ID, buildLabelFilter())
  }

  function firstSymbolLayer() {
    for (const l of (map.getStyle()?.layers || [])) {
      if (l.type === 'symbol') return l.id
    }
    return undefined
  }

  function handleClick(e) {
    if (!enabled) return
    const iso = e.features?.[0]?.properties?.ISO_A3
    if (!iso || iso === '-99') return
    selectedISO = (selectedISO === iso) ? null : iso
    updatePaint()
    _onselect?.(selectedISO)
    _onchange?.()
  }

  const handleMouseEnter = () => { if (enabled) map.getCanvas().style.cursor = 'crosshair' }
  const handleMouseLeave = () => { if (enabled) map.getCanvas().style.cursor = '' }

  function addLayers() {
    if (map.getSource(SRC)) return

    map.addSource(SRC, { type: 'geojson', data: geoData, generateId: true })

    const before = firstSymbolLayer()

    map.addLayer({ id: FILL_ID, type: 'fill', source: SRC,
      paint: { 'fill-color': buildFillColor(), 'fill-opacity': buildFillOpacity() }
    }, before)

    map.addLayer({ id: LINE_ID, type: 'line', source: SRC,
      paint: { 'line-color': buildLineColor(), 'line-width': buildLineWidth(), 'line-opacity': buildLineOpacity() }
    }, before)

    map.addLayer({
      id: LABEL_ID, type: 'symbol', source: SRC,
      filter: buildLabelFilter(),
      layout: {
        'text-field':  ['get', 'ADMIN'],
        'text-font':   ['Open Sans Bold', 'Arial Unicode MS Bold'],
        'text-size':   ['interpolate', ['linear'], ['zoom'], 2, 11, 6, 16],
        'text-anchor': 'center',
        'text-allow-overlap':    false,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color':      '#ffffff',
        'text-halo-color': 'rgba(0,0,0,0.75)',
        'text-halo-width': 2,
      }
    })

    map.on('click',      FILL_ID, handleClick)
    map.on('mouseenter', FILL_ID, handleMouseEnter)
    map.on('mouseleave', FILL_ID, handleMouseLeave)
  }

  function removeLayers() {
    map.off('click',      FILL_ID, handleClick)
    map.off('mouseenter', FILL_ID, handleMouseEnter)
    map.off('mouseleave', FILL_ID, handleMouseLeave)
    if (map.getLayer(LABEL_ID)) map.removeLayer(LABEL_ID)
    if (map.getLayer(FILL_ID))  map.removeLayer(FILL_ID)
    if (map.getLayer(LINE_ID))  map.removeLayer(LINE_ID)
    if (map.getSource(SRC))     map.removeSource(SRC)
  }

  map.on('style.load', () => { if (enabled && geoData) addLayers() })

  let loadPromise = null
  function ensureData() {
    if (geoData) return Promise.resolve()
    if (loadPromise) return loadPromise
    loadPromise = fetch(TOPO_URL)
      .then(r => r.json())
      .then(topo => { geoData = toGeoJSON(topo) })
      .catch(e => { console.error('Country data load failed:', e); loadPromise = null })
    return loadPromise
  }

  return {
    get selectedISO() { return selectedISO },
    get styles()      { return styles },
    get enabled()     { return enabled },
    set onchange(fn)  { _onchange = fn },
    set onselect(fn)  { _onselect = fn },

    async enable() {
      enabled = true
      await ensureData()
      if (geoData) addLayers()
    },

    disable() {
      enabled = false
      selectedISO = null
      map.getCanvas().style.cursor = ''
      removeLayers()
      _onchange?.()
    },

    deselect() {
      selectedISO = null
      updatePaint()
      _onselect?.(null)
      _onchange?.()
    },

    setStyle(iso, color, opacity) {
      styles[iso] = { color, opacity }
      persist()
      updatePaint()
      _onchange?.()
    },

    removeStyle(iso) {
      delete styles[iso]
      if (selectedISO === iso) { selectedISO = null; _onselect?.(null) }
      persist()
      updatePaint()
      _onchange?.()
    },

    clearAll() {
      styles = {}
      selectedISO = null
      persist()
      updatePaint()
      _onselect?.(null)
      _onchange?.()
    },

    getCountryName(iso) {
      if (!geoData || !iso) return iso || ''
      const feat = geoData.features.find(f => f.properties.ISO_A3 === iso)
      return feat?.properties.ADMIN || feat?.properties.NAME || iso
    }
  }
}
