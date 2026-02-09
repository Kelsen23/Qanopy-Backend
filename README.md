<h1 align="center">Qanopy Backend</h1>

<p align="center">
  🚀 Backend service for <b>Qanopy</b> – powering authentication, APIs, caching, and database management.
</p>

<p align="center">
  <img src="assets/qanopy-logo.png" alt="Qanopy Logo" width="800"/>
</p>

---

## 🛠️ Tech Stack

### Backend Framework
- Node.js + Express

### Databases
- **PostgreSQL** (Prisma ORM)
- **MongoDB** (Mongoose ODM)

### Caching & Messaging
- Redis (caching, sessions, rate limiting, Pub/Sub)

### Background Jobs
- BullMQ – job queues & scheduling

### Real-Time Communication
- Socket.IO – event-based updates

### APIs
- REST
- GraphQL

### Validation
- **Zod** – validation for REST request bodies

### Storage & CDN
- AWS S3 – file storage  
- AWS CloudFront – CDN for fast global delivery
- AWS Rekognition - file content moderation

---

## ⚙️ Setup

```bash
# Clone repo
git clone https://github.com/Kelsen23/Qanopy-Backend.git
cd Qanopy-Backend

# Install dependencies
npm install

# Run development server
npm run dev
```

## 🤝 Contributing

Contributions are welcome!

If you’d like to improve **Qanopy-Backend**, feel free to **fork the repository** and submit a pull request.  
This project is licensed under the **MIT License**, so you’re free to use, modify, and share it.

Steps to contribute:

1. Fork the repository
2. Create a new branch (`git checkout -b feature-name`)
3. Make your changes
4. Commit and push (`git commit -m "Add new feature" && git push origin feature-name`)
5. Open a Pull Request
