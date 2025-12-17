// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

contract EChainID {
    address public owner;

    struct Credential {
        bytes32 hash;
        string ipfsCID;
        address issuer;
        bool revoked;
        uint256 timestamp;
    }

    mapping(bytes32 => Credential) public credentials;
    mapping(address => bool) public issuers;

    event IssuerAdded(address indexed issuer);
    event CredentialIssued(bytes32 indexed hash, string cid, address indexed student, address indexed issuer);
    event CredentialRevoked(bytes32 indexed hash, address indexed revoker);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyIssuer() {
        require(issuers[msg.sender], "only issuer");
        _;
    }

    constructor() {
        owner = msg.sender;
        issuers[msg.sender] = true;
        emit IssuerAdded(msg.sender);
    }

    function addIssuer(address _issuer) external onlyOwner {
        issuers[_issuer] = true;
        emit IssuerAdded(_issuer);
    }

    function issueCredential(bytes32 _hash, string memory _cid, address /* _student */) external onlyIssuer {
        require(credentials[_hash].timestamp == 0, "already exists");
        credentials[_hash] = Credential({
            hash: _hash,
            ipfsCID: _cid,
            issuer: msg.sender,
            revoked: false,
            timestamp: block.timestamp
        });
        emit CredentialIssued(_hash, _cid, address(0), msg.sender);
    }

    function revokeCredential(bytes32 _hash) external onlyIssuer {
        require(credentials[_hash].timestamp != 0, "not found");
        credentials[_hash].revoked = true;
        emit CredentialRevoked(_hash, msg.sender);
    }

    function getCredential(bytes32 _hash) external view returns (Credential memory) {
        return credentials[_hash];
    }
}
