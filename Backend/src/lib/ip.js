const { BlockList, isIP, SocketAddress } = require('node:net');

function normalizeIp(value) {
  if (typeof value !== 'string' || value.includes('%') || !isIP(value)) return null;
  const address = new SocketAddress({ address: value, family: isIP(value) === 4 ? 'ipv4' : 'ipv6' }).address;
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

// Node의 IP 파서를 사용하여 IPv6와 IPv4-mapped IPv6도 같은 주소로 비교합니다.
function createIpMatcher(value = '', name = 'IP 설정') {
  const entries = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  const addresses = new BlockList();
  for (const entry of entries) {
    const [address, prefix, ...extra] = entry.split('/');
    const version = isIP(address);
    if (!version || address.includes('%') || extra.length ||
        (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) > (version === 4 ? 32 : 128)))) {
      throw new Error(`${name}: 올바른 IP 또는 CIDR을 입력해주세요 (${entry}).`);
    }
    const family = version === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) addresses.addAddress(address, family);
    else addresses.addSubnet(address, Number(prefix), family);
  }
  return {
    configured: entries.length > 0,
    matches(value) {
      const address = normalizeIp(value);
      if (!address) return false;
      return addresses.check(address, isIP(address) === 4 ? 'ipv4' : 'ipv6');
    },
  };
}

module.exports = { normalizeIp, createIpMatcher };
