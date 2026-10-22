import { BlockList, isIP } from 'node:net';
const blocked = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['192.0.2.0', 24],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]]) blocked.addSubnet(network, prefix);
const publicV6 = new BlockList(); publicV6.addSubnet('2000::', 3, 'ipv6');
blocked.addSubnet('2001:db8::', 32, 'ipv6');
export const publicAddress = address => isIP(address) === 4 ? !blocked.check(address, 'ipv4')
  : isIP(address) === 6 && publicV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
