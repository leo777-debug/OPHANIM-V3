(() => {
  const root = globalThis.OphanimExtension = globalThis.OphanimExtension || {};
  const PORTS = ['JEBEL ALI', 'DUBAI', 'MUMBAI', 'NHAVA SHEVA', 'SINGAPORE', 'ROTTERDAM', 'HAMBURG', 'ANTWERP', 'SHANGHAI', 'NINGBO', 'SHENZHEN', 'HONG KONG', 'LOS ANGELES', 'LONG BEACH', 'NEW YORK', 'SAVANNAH', 'FELIXSTOWE', 'PIRAEUS', 'PORT SAID', 'SALALAH', 'SOHAR', 'KHALIFA PORT'];
  const CARRIERS = ['MAERSK', 'MSC', 'CMA CGM', 'HAPAG-LLOYD', 'HAPAG LLOYD', 'COSCO', 'EVERGREEN', 'ONE', 'OOCL', 'ZIM', 'YANG MING', 'PIL', 'WAN HAI'];

  function containerCheckDigit(value) {
    const letters = '0123456789A?BCDEFGHIJK?LMNOPQRSTU?VWXYZ';
    const normalized = value.replace(/\s/g, '').toUpperCase();
    if (!/^[A-Z]{4}\d{7}$/.test(normalized)) return false;
    let sum = 0;
    for (let index = 0; index < 10; index += 1) {
      const character = normalized[index];
      const numeric = /\d/.test(character) ? Number(character) : letters.indexOf(character);
      sum += numeric * (2 ** index);
    }
    return (sum % 11) % 10 === Number(normalized[10]);
  }

  function imoCheckDigit(value) {
    const digits = value.replace(/\D/g, '');
    if (!/^\d{7}$/.test(digits)) return false;
    const total = digits.slice(0, 6).split('').reduce((sum, digit, index) => sum + Number(digit) * (7 - index), 0);
    return total % 10 === Number(digits[6]);
  }

  function add(output, type, value, confidence, source) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (clean.length < 2) return;
    if (output.some((entity) => entity.type === type && entity.value.toUpperCase() === clean.toUpperCase())) return;
    output.push({ type, value: clean, confidence, source });
  }

  root.detectEntities = (text, source = 'generic') => {
    const input = String(text || '').slice(0, 120000);
    const upper = input.toUpperCase();
    const output = [];

    for (const match of input.matchAll(/\b([A-Z]{4})[\s-]?(\d{7})\b/g)) {
      const value = `${match[1]}${match[2]}`;
      if (containerCheckDigit(value)) add(output, 'container_number', value, 98, source);
    }
    for (const match of input.matchAll(/\bIMO[\s:#-]*(\d{7})\b/gi)) {
      if (imoCheckDigit(match[1])) add(output, 'imo_number', match[1], 99, source);
    }
    for (const match of input.matchAll(/\bMMSI[\s:#-]*(\d{9})\b/gi)) add(output, 'mmsi_number', match[1], 99, source);
    for (const match of input.matchAll(/\b(?:SHIPMENT|BOOKING|REFERENCE|REF)[\s:#-]+([A-Z0-9][A-Z0-9-]{4,24})\b/gi)) add(output, 'shipment_reference', match[1], 92, source);
    for (const match of input.matchAll(/\b(?:VESSEL|M\/V|MV)[\s:#-]+([A-Z][A-Z0-9 .'-]{2,50})/gi)) add(output, 'vessel_name', match[1].split(/\n|\r|\s{3,}/)[0], 82, source);
    for (const match of input.matchAll(/\b(?:SUPPLIER|CUSTOMER|LOGISTICS COMPANY)[\s:#-]+([A-Z][A-Z0-9 &.'-]{2,70})/gi)) add(output, 'company', match[1].split(/\n|\r|\s{3,}/)[0], 72, source);

    for (const port of PORTS) if (upper.includes(port)) add(output, 'port', port, port.length <= 5 ? 66 : 82, source);
    for (const carrier of CARRIERS) if (new RegExp(`\\b${carrier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(input)) add(output, 'carrier', carrier, 84, source);
    return output.sort((left, right) => right.confidence - left.confidence).slice(0, 30);
  };
})();
