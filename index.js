const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = 4000;
const uri = 'mongodb+srv://map:map@cluster0.afflo.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
const client = new MongoClient(uri);
let db;

app.use(cors());
app.use(express.json());

async function connectToDatabase() {
  try {
    await client.connect();
    db = client.db('MAP_APP');
    await db.createCollection('pki_certificates');
    console.log('PKI Server: Connected to MongoDB');
  } catch (error) {
    console.error('PKI Server MongoDB connection error:', error);
    process.exit(1);
  }
}

function generateKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
}

function generateCertificate(publicKey, userId, email) {
  return {
    serialNumber: crypto.randomBytes(16).toString('hex'),
    userId: userId,
    email: email,
    publicKey: publicKey,
    issuer: 'ETR TRACKER PKI Authority',
    validFrom: new Date(),
    validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    signature: crypto.randomBytes(32).toString('hex')
  };
}

app.post('/generate-certificate', async (req, res) => {
  try {
    const { userId, email } = req.body;
    console.log('Generating certificate for:', { userId, email });

    if (!userId || !email) {
      return res.status(400).json({ error: 'User ID and email are required' });
    }

    const keyPair = generateKeyPair();
    const certificate = generateCertificate(keyPair.publicKey, userId, email);
    console.log(certificate)

    await db.collection('pki_certificates').insertOne({
      ...certificate,
      createdAt: new Date()
    });

    console.log('Certificate generated successfully');
    res.json({
      message: 'Certificate generated successfully',
      certificate,
      privateKey: keyPair.privateKey
    });
    console.log(keyPair.privateKey)
  } catch (error) {
    console.error('Certificate generation error:', error);
    res.status(500).json({ error: 'Certificate generation failed' });
  }
});

app.post('/verify-certificate', async (req, res) => {
  try {
    const { userId, email } = req.body;
    console.log('Verifying certificate for:', { userId, email });

    const certificate = await db.collection('pki_certificates').findOne({
      userId,
      email
    });
    console.log(certificate)

    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    if (new Date() > new Date(certificate.validTo)) {
      return res.status(401).json({ error: 'Certificate expired' });
    }

    res.json({
      valid: true,
      certificate
    });
  } catch (error) {
    console.error('Certificate verification error:', error);
    res.status(500).json({ error: 'Certificate verification failed' });
  }
});

connectToDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`PKI Server is running on http://localhost:${PORT}`);
  });
}).catch(console.error);