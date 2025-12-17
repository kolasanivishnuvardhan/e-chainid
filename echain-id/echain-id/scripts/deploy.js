async function main(){
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with', deployer.address);
  const EChain = await ethers.getContractFactory('EChainID');
  const echain = await EChain.deploy();
  await echain.deployed();
  console.log('EChain deployed at', echain.address);
  // Save address for frontend use
  const fs = require('fs');
  fs.writeFileSync('deployed-address.txt', echain.address);
}

main().catch(e => { console.error(e); process.exit(1); });
