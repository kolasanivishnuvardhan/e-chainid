import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import sha256 from 'js-sha256';
import QRCode from 'qrcode.react';
import abi from './contract/abi.json';
import './App.css';

const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS || '';
const PINATA_JWT = process.env.REACT_APP_PINATA_JWT || '';

function connectMetaMask(){
  if(!window.ethereum) throw new Error('MetaMask not found');
  return window.ethereum.request({ method: 'eth_requestAccounts' });
}

export default function App(){
  const [accounts, setAccounts] = useState([]);
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [contractInitError, setContractInitError] = useState('');
  const [status, setStatus] = useState('');
  const [cid, setCid] = useState('');
  const [issuedHash, setIssuedHash] = useState('');
  const [credJSON, setCredJSON] = useState({ name:'', degree:'', year:'' });

  useEffect(() => {
    if(window.ethereum){
      const p = new ethers.providers.Web3Provider(window.ethereum);
      setProvider(p);
      const onAccountsChanged = () => window.location.reload();
      window.ethereum.on('accountsChanged', onAccountsChanged);
      return () => {
        try{
          window.ethereum.removeListener('accountsChanged', onAccountsChanged);
        }catch(_e){
          // ignore
        }
      };
    }
  }, []);

  useEffect(() => {
    if(!provider || !CONTRACT_ADDRESS) return;
    let cancelled = false;
    (async () => {
      try{
        const network = await provider.getNetwork();
        const code = await provider.getCode(CONTRACT_ADDRESS);
        if(cancelled) return;
        if(!code || code === '0x'){
          setContract(null);
          const msg =
            `No contract found at ${CONTRACT_ADDRESS} on chainId ${network.chainId}. ` +
            `Switch MetaMask to the same network you deployed to, and update REACT_APP_CONTRACT_ADDRESS.`;
          setContractInitError(msg);
          setStatus(msg);
          return;
        }
        const signer = provider.getSigner();
        const c = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
        setContract(c);
        setContractInitError('');
      }catch(e){
        if(cancelled) return;
        setContract(null);
        const msg = 'Contract init error: ' + (e?.message || String(e));
        setContractInitError(msg);
        setStatus(msg);
      }
    })();
    return () => { cancelled = true; };
  }, [provider, CONTRACT_ADDRESS]);

  async function onConnect(){
    try{
      const accs = await connectMetaMask();
      setAccounts(accs);
      setStatus('MetaMask connected: ' + accs[0]);
    }catch(e){ setStatus('Connect error: ' + e.message); }
  }

  async function uploadToIPFS(jsonData){
    const jwt = (PINATA_JWT || '').trim();
    if(!jwt) throw new Error('Pinata JWT missing (set REACT_APP_PINATA_JWT in frontend/.env and restart npm start)');

    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        pinataContent: jsonData,
        pinataMetadata: { name: 'EChainID-Credential' },
      }),
    });

    const data = await res.json().catch(() => null);
    if(!res.ok){
      const msg = data?.error?.details || data?.error || data?.message || JSON.stringify(data);
      throw new Error('Pinata upload failed: ' + msg);
    }
    if(!data || !data.IpfsHash) throw new Error('Unexpected Pinata response');
    return data.IpfsHash;
  }

  async function issueCred(){
    try{
      if(!accounts[0]) throw new Error('Wallet not connected. Click “Connect MetaMask” first.');
      if(!contract) throw new Error(contractInitError || 'Contract not ready yet. Check MetaMask network and contract address.');
      setStatus('Preparing credential...');
      const doc = { ...credJSON, issuedAt: new Date().toISOString() };
      let _cid = cid;
      if(!_cid){
        _cid = await uploadToIPFS(doc);
        setCid(_cid);
      }
      const hexHash = '0x' + sha256(JSON.stringify(doc));
      setIssuedHash(hexHash);
      setStatus('Sending transaction to issue credential...');
      const tx = await contract.issueCredential(hexHash, _cid, accounts[0] || ethers.constants.AddressZero);
      await tx.wait();
      setStatus('Credential issued. tx: ' + tx.hash);
    }catch(e){ setStatus('Issue error: ' + e.message); }
  }

  async function verifyByCID(){
    try{
      if(!contract) throw new Error(contractInitError || 'Contract not ready yet. Check MetaMask network and contract address.');
      setStatus('Querying on-chain metadata...');
      // fetch JSON from public gateway
      if(!cid) throw new Error('CID is empty');

      const candidateUrls = [
        `https://gateway.pinata.cloud/ipfs/${cid}`,
        `https://cloudflare-ipfs.com/ipfs/${cid}`,
        `https://${cid}.ipfs.dweb.link/`,
        // Backward compatibility if CID points to a directory with credential.json
        `https://${cid}.ipfs.dweb.link/credential.json`,
      ];

      let doc = null;
      let lastErr = null;
      for(const url of candidateUrls){
        try{
          const res = await fetch(url);
          if(!res.ok) throw new Error(String(res.status));
          doc = await res.json();
          break;
        }catch(e){
          lastErr = e;
        }
      }
      if(!doc) throw new Error('IPFS fetch failed: ' + (lastErr?.message || 'unknown error'));

      const localHash = '0x' + sha256(JSON.stringify(doc));
      const meta = await contract.getCredential(localHash);
      if(meta.timestamp.toNumber && meta.timestamp.toNumber() === 0) {
        setStatus('Credential not found on-chain.');
        return;
      }
      const revoked = meta.revoked;
      setStatus(`On-chain found. revoked: ${revoked}. issuer: ${meta.issuer}`);
    }catch(e){ setStatus('Verify error: ' + e.message); }
  }

  async function revokeCred(){
    try{
      if(!accounts[0]) throw new Error('Wallet not connected. Click “Connect MetaMask” first.');
      if(!contract) throw new Error(contractInitError || 'Contract not ready yet. Check MetaMask network and contract address.');
      if(!issuedHash) throw new Error('No issued hash in state');
      const tx = await contract.revokeCredential(issuedHash);
      await tx.wait();
      setStatus('Revoked. tx: ' + tx.hash);
    }catch(e){ setStatus('Revoke error: ' + e.message); }
  }

  const friendlyStatus = status || 'Idle - ready to issue and verify credentials.';
  const shortAccount = accounts[0]
    ? `${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`
    : '';

  const canUseContract = Boolean(contract);
  const canTransact = Boolean(contract && accounts[0]);

  return (
    <div className="app-shell">
      <div className="orb orb-one" aria-hidden="true" />
      <div className="orb orb-two" aria-hidden="true" />

      <div className="page">
        <header className="app-header">
          <div>
            <p className="eyebrow">Ethereum + IPFS</p>
            <h1>EChainID Credential Studio</h1>
            <p className="lede">
              Issue a credential, pin its JSON to IPFS (Pinata), and record its hash on-chain (Ganache).
            </p>
          </div>
          <div className="header-actions">
            <button className="btn primary" type="button" onClick={onConnect}>
              {accounts.length ? 'Reconnect Wallet' : 'Connect MetaMask'}
            </button>
            {shortAccount && <span className="address-pill">{shortAccount}</span>}
          </div>
        </header>

        <section className="status-banner">
          <span className="pulse" />
          <p>{friendlyStatus}</p>
        </section>

        <section className="card token-card">
          <div className="card-head small">
            <div>
              <p className="eyebrow">Storage Settings</p>
              <h2>Pinata JWT</h2>
            </div>
            {PINATA_JWT ? <span className="badge">Configured</span> : <span className="badge ghost">Missing</span>}
          </div>
          <p className="hint-text">
            Uses REACT_APP_PINATA_JWT from frontend/.env. If you change it, restart npm start.
          </p>
          {!PINATA_JWT && (
            <p className="hint-text warning">
              Missing Pinata JWT. Add REACT_APP_PINATA_JWT=... in frontend/.env.
            </p>
          )}
        </section>

        <main className="card-grid">
          <section className="card card-primary">
            <div className="card-head">
              <div>
                <p className="eyebrow">Issuer Workspace</p>
                <h2>Issue Credential</h2>
              </div>
              <span className="badge">On-chain</span>
            </div>

            <div className="form-grid">
              <label>
                Name
                <input
                  value={credJSON.name}
                  placeholder="Ada Lovelace"
                  onChange={e => setCredJSON({ ...credJSON, name: e.target.value })}
                />
              </label>
              <label>
                Degree
                <input
                  value={credJSON.degree}
                  placeholder="BSc Computer Science"
                  onChange={e => setCredJSON({ ...credJSON, degree: e.target.value })}
                />
              </label>
              <label>
                Year
                <input
                  value={credJSON.year}
                  placeholder="2025"
                  onChange={e => setCredJSON({ ...credJSON, year: e.target.value })}
                />
              </label>
            </div>

            <div className="input-stack inline">
              <label>
                Existing IPFS CID (optional)
                <input
                  value={cid}
                  placeholder="bafy..."
                  onChange={e => setCid(e.target.value)}
                />
              </label>
              <button className="btn primary" type="button" onClick={issueCred} disabled={!canTransact}>
                Issue Credential
              </button>
            </div>
          </section>

          <section className="card card-verify">
            <div className="card-head">
              <div>
                <p className="eyebrow">Verification Desk</p>
                <h2>Verify / Revoke</h2>
              </div>
              <span className="badge ghost">Off-chain + On-chain</span>
            </div>

            <label>
              Credential CID
              <input
                value={cid}
                placeholder="Paste CID to verify"
                onChange={e => setCid(e.target.value)}
              />
            </label>

            <div className="action-row">
              <button className="btn ghost" type="button" onClick={verifyByCID} disabled={!canUseContract}>
                Verify via IPFS
              </button>
              <button className="btn danger" type="button" onClick={revokeCred} disabled={!canTransact}>
                Revoke Credential
              </button>
            </div>
          </section>
        </main>

        <section className="data-grid">
          <div className="card data-card">
            <p className="label">Issued hash</p>
            <p className="mono">{issuedHash || '—'}</p>
          </div>
          <div className="card data-card">
            <p className="label">Current CID</p>
            <div className="cid-row">
              <span>{cid || 'No CID yet'}</span>
              {cid && (
                <div className="qr-wrapper">
                  <QRCode value={cid} size={96} bgColor="transparent" fgColor="#ffffff" />
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
