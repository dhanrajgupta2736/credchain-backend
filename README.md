# CredChain 🎓

> **Decentralized Credential Issuance & Verification on Blockchain**

A self-sovereign credential management system built on Avalanche blockchain, enabling students to issue and verify academic credentials transparently and securely.

![Version](https://img.shields.io/badge/version-4.0-blue)
![Solidity](https://img.shields.io/badge/solidity-^0.8.20-blue)
![Node.js](https://img.shields.io/badge/node.js-18.x-green)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 🌟 Features

- ✨ **Self-Sovereign Issuance** — Any wallet can issue their own credentials without intermediaries
- 🔒 **Blockchain Verified** — Credentials immutably stored on Avalanche Fuji Testnet
- 🆔 **Unique PRN Protection** — Each PRN can only be issued once, preventing duplication
- 🔍 **Easy Verification** — Verify credentials instantly via blockchain
- 💼 **Complete Grade Records** — Store comprehensive academic data including subjects, grades, and GPA
- 🌓 **Beautiful UI** — Modern dark/light theme interface with Web3 integration
- 📱 **Responsive Design** — Works seamlessly across all devices
- 🔗 **MetaMask Integration** — Secure wallet connection and transaction management

---

## 🏗️ Architecture

```
CredChain/
├── StudentCredentials.sol    # Smart Contract (Avalanche)
├── frontend/
│   ├── credchain-issue.html  # Issue credentials UI
│   ├── credchain-verify.html # Verify credentials UI
│   └── credchain-config.js   # Web3 & contract configuration
└── github/
    ├── server.js             # Express backend
    └── package.json          # Dependencies
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Blockchain** | Solidity 0.8.20 (Avalanche Fuji) |
| **Frontend** | HTML5, CSS3, Ethers.js |
| **Backend** | Node.js, Express.js |
| **Data Fetching** | Axios, Cheerio (web scraping) |
| **Infrastructure** | Railway deployment |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18.x or higher
- MetaMask browser extension
- AVAX tokens (testnet) from [Avalanche Faucet](https://faucet.avax-test.network/)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/credchain.git
   cd credchain
   ```

2. **Install backend dependencies**
   ```bash
   cd github
   npm install
   ```

3. **Configure the smart contract address**
   - Update `contractAddress` in [frontend/credchain-config.js](frontend/credchain-config.js) if redeploying
   - Current contract: `0x8C77a60746699C566Ec94774C920e113816ADE20`

4. **Start the backend server**
   ```bash
   npm start
   # Server runs on http://localhost:3000
   ```

5. **Open frontend interfaces**
   - Issue credentials: Open `frontend/credchain-issue.html` in browser
   - Verify credentials: Open `frontend/credchain-verify.html` in browser

---

## 📖 Usage

### Issuing a Credential

1. Connect your MetaMask wallet to Avalanche Fuji Testnet
2. Navigate to `credchain-issue.html`
3. Fill in student information:
   - **PRN** (Student ID) - Unique identifier
   - **Student Name** - Full name
   - **Course Details** - Name, semester, exam title
   - **Academic Data** - Subjects with codes, grades, and credits
4. Click "Issue Credential" and approve the transaction in MetaMask
5. Credential is now immutably stored on blockchain ✓

### Verifying a Credential

1. Navigate to `credchain-verify.html`
2. Enter the student's **PRN** (Student ID)
3. View complete credential details:
   - Course information
   - Grade breakdown by subject
   - SGPA and grade label
   - Issue date and issuer wallet
   - Validity status
4. All data is retrieved directly from the blockchain

---

## 🔧 Smart Contract API

### Core Functions

#### `issueCredential(CredentialInput, SubjectsInput)`
Issue a new credential to the blockchain.

```solidity
function issueCredential(
    CredentialInput memory info,
    SubjectsInput memory subj
) public
```

**Parameters:**
- `info.prn` — Unique 12-digit PRN (cannot be reissued)
- `info.studentName` — Student's full name
- `info.courseName` — Course title
- `info.sgpa` — Semester GPA
- `info.gradeLabel` — Grade (A, B, C, etc.)
- `info.semester` — Semester number
- `info.examTitle` — Exam name
- `subj` — Array of subjects with codes, names, types, credits, grades, results

**Events:**
- `CredentialIssued(id, prn, studentName, issuedBy)`

#### `verifyByPRN(string prn)`
Retrieve credential details by PRN from the blockchain.

```solidity
function verifyByPRN(string prn) public view returns (Credential)
```

**Returns:**
- Complete credential struct with all academic details
- Issuer wallet address
- Issue timestamp
- Validity status

#### `revokeCredential(string prn)` 
Admin function to revoke an invalid credential.

```solidity
function revokeCredential(string prn) public onlyAdmin
```

---

## 🌐 Blockchain Details

**Network:** Avalanche Fuji Testnet
- **Chain ID:** 43113
- **RPC URL:** `https://api.avax-test.network/ext/bc/C/rpc`
- **Explorer:** [Snowtrace Testnet](https://testnet.snowtrace.io)

**Contract Address:**
```
0x8C77a60746699C566Ec94774C920e113816ADE20
```

**Gas Considerations:**
- Issuance: ~150,000 gas
- Verification: ~50,000 gas (read-only)
- Revocation: ~80,000 gas (admin only)

---

## 🔌 Backend API

### Endpoints

#### `GET /`
Health check endpoint.

```bash
curl https://credchain-backend-production.up.railway.app/
```

Response:
```json
{
  "status": "CredChain backend running",
  "version": "4.0"
}
```

#### `POST /fetch-result`
Fetch exam results from Sandip University.

```bash
curl -X POST https://credchain-backend-production.up.railway.app/fetch-result \
  -H "Content-Type: application/json" \
  -d '{"prn": "123456789012", "dob": "01-01-2000"}'
```

**Request Parameters:**
- `prn` — 12-digit PRN
- `dob` — Date of birth (DD-MM-YYYY format)

**Response:**
```json
{
  "success": true,
  "examCode": "...",
  "subjects": [...],
  "sgpa": "7.5",
  "gradeLabel": "A"
}
```

---

## 📝 Data Structures

### Credential Object

```solidity
struct Credential {
    string    prn;              // Unique student ID
    string    studentName;      // Full name
    string    courseName;       // Course title
    string    sgpa;             // Semester GPA
    string    gradeLabel;       // Letter grade
    string    semester;         // Semester number
    string    examTitle;        // Exam name
    uint256   issuedAt;         // Blockchain timestamp
    bool      isValid;          // Revocation status
    address   issuedBy;         // Issuer wallet
    Subject[] subjects;         // Course details array
}

struct Subject {
    string courseCode;          // e.g., "CS101"
    string courseName;          // e.g., "Data Structures"
    string courseType;          // e.g., "Core"
    string credits;             // e.g., "4"
    string grade;               // e.g., "A"
    string result;              // e.g., "Pass"
}
```

---

## 🎯 Use Cases

| Use Case | Benefit |
|----------|---------|
| **Self-Certification** | Students independently issue and manage their credentials |
| **Fraud Prevention** | Blockchain immutability prevents credential tampering |
| **Instant Verification** | Employers/institutions verify credentials in seconds |
| **Global Portability** | Digital credentials work across institutions and countries |
| **Privacy Control** | Students control what information is shared |

---

## 🔐 Security Considerations

- ✅ **PRN Uniqueness** — Each PRN can only be issued once on-chain
- ✅ **Immutability** — Credentials cannot be altered after issuance
- ✅ **Wallet Authentication** — MetaMask ensures only wallet owner can issue
- ✅ **Admin Revocation** — Only contract admin can mark credentials as invalid
- ✅ **Transparent Issuance** — All transactions and issuers visible on explorer

---

## 📊 Project Context

**Built for:** Sandip University Hackathon, April 2026

This project demonstrates how blockchain technology can revolutionize credential management by:
- Eliminating central authentication authorities
- Reducing verification time from days to seconds
- Creating tamper-proof academic records
- Empowering students with self-sovereign credentials

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## 🙋 Support & Questions

- 📧 Email: support@credchain.dev
- 💬 Discord: [Join Community](https://discord.gg/credchain)
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/credchain/issues)

---

## 🎓 Acknowledgments

- Sandip University for hackathon opportunity
- Avalanche blockchain for infrastructure
- The Web3 community for guidance and support

---

**Made with ❤️ by CredChain Team**

```
█████████████████████████████
██ C R E D C H A I N   v4 ██
█████████████████████████████
```
