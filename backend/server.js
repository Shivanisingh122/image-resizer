// server.js
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const UPLOAD_DIR = 'uploads';

const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error('Invalid file type');
      error.code = 'INVALID_FILE_TYPE';
      return cb(error, false);
    }
    cb(null, true);
  }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR);
}

app.post('/upload', upload.single('image'), async (req, res) => {
  try {
    const { width, height, format = 'jpeg', watermark = false } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const imageId = uuidv4();
    const outputFilename = `${imageId}.${format}`;
    const outputPath = path.join(UPLOAD_DIR, outputFilename);

    let sharpInstance;

    if (req.file.mimetype === 'image/svg+xml') {
      await fsPromises.writeFile(outputPath, req.file.buffer);
    } else {
      sharpInstance = sharp(req.file.buffer);

      if (format !== 'gif' && (width || height)) {
        sharpInstance = sharpInstance.resize(
          width ? parseInt(width) : null,
          height ? parseInt(height) : null,
          { fit: 'inside', withoutEnlargement: true }
        );
      }

      if (format !== 'gif' && watermark) {
        const watermarkText = 'Image Resizer';
        const svgBuffer = Buffer.from(`
          <svg width="200" height="50">
            <text x="50%" y="50%" font-family="Arial" font-size="24"
                  fill="rgba(255,255,255,0.5)" text-anchor="middle"
                  alignment-baseline="middle">${watermarkText}</text>
          </svg>
        `);
        sharpInstance = sharpInstance.composite([{ input: svgBuffer, gravity: 'southeast' }]);
      }

      if (format === 'jpeg') {
        sharpInstance = sharpInstance.jpeg({ quality: 80 });
      } else if (format === 'png') {
        sharpInstance = sharpInstance.png({ compressionLevel: 9 });
      } else if (format === 'gif') {
        sharpInstance = sharpInstance.gif(); // Simple GIF support
      }

      await sharpInstance.toFile(outputPath);
    }

    res.json({
      success: true,
      imageId,
      url: `/download/${imageId}`
    });
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ error: 'Error processing image' });
  }
});

app.get('/download/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;
    const files = await fsPromises.readdir(UPLOAD_DIR);
    const imageFile = files.find(file => file.startsWith(imageId));

    if (!imageFile) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.sendFile(path.join(__dirname, UPLOAD_DIR, imageFile));
  } catch (error) {
    console.error('Error downloading image:', error);
    res.status(500).json({ error: 'Error downloading image' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
