const cors = require("cors");
const express = require("express");
const multer = require("multer");
const JSZip = require("jszip");
const PDFDocument = require("pdfkit");
const zlib = require("zlib");
const sharp = require("sharp");

const app = express();
app.use(cors());
const upload = multer();

app.get("/", (req, res) => {
  res.send("API ZPL ZIP → PDF rodando 🚀");
});

app.post("/convert", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("Arquivo não enviado");
    }

    const zip = await JSZip.loadAsync(req.file.buffer);
    const fileNames = Object.keys(zip.files).filter(name => !zip.files[name].dir);

    if (fileNames.length === 0) {
      return res.status(400).send("ZIP vazio");
    }

    const images = [];

    for (const fileName of fileNames) {
      const content = await zip.files[fileName].async("string");

      // Extrai todos os blocos GRF do arquivo
      const grfBlocks = [...content.matchAll(/~DGR:[^,]+,(\d+),(\d+),:Z64:([A-Za-z0-9+/=]+)/g)];
      console.log("Blocos GRF encontrados:", grfBlocks.length);

      for (const block of grfBlocks) {
        try {
          const totalBytes = parseInt(block[1]);
          const rowBytes = parseInt(block[2]);
          const compressed = Buffer.from(block[3], "base64");
          const bitmap = zlib.inflateSync(compressed);

          const width = rowBytes * 8;
          const height = Math.floor(totalBytes / rowBytes);

          console.log(`GRF: ${width}x${height}, bytes: ${bitmap.length}`);

          // Converte bitmap 1-bit para PNG via sharp
          const png = await sharp(bitmap, {
            raw: { width, height, channels: 1 }
          })
            .png()
            .toBuffer();

          images.push(png);
        } catch (e) {
          console.error("Erro num bloco GRF:", e.message);
        }
      }
    }

    if (images.length === 0) {
      return res.status(500).send("Nenhuma etiqueta convertida");
    }

    const doc = new PDFDocument({ size: [288, 432], autoFirstPage: false });
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    for (const imgData of images) {
      doc.addPage();
      doc.image(imgData, 0, 0, { width: 288 });
    }

    doc.end();

  } catch (error) {
    console.error(error);
    res.status(500).send("Erro na conversão");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
