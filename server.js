const express = require("express");
const multer = require("multer");
const JSZip = require("jszip");
const PDFDocument = require("pdfkit");
const axios = require("axios");

const app = express();
const upload = multer();

app.get("/", (req, res) => {
  res.send("API ZPL ZIP → PDF rodando 🚀");
});

app.post("/convert", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).send("Arquivo não enviado");
    }

    // 1️⃣ Descompacta ZIP
    const zip = await JSZip.loadAsync(req.file.buffer);
    const fileNames = Object.keys(zip.files);

    if (fileNames.length === 0) {
      return res.status(400).send("ZIP vazio");
    }

    const zplFile = zip.files[fileNames[0]];
    const zplContent = await zplFile.async("string");

    // 2️⃣ Converte ZPL em imagem via Labelary
    const labelaryResponse = await axios.post(
      "http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/",
      zplContent,
      {
        responseType: "arraybuffer",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    // 3️⃣ Cria PDF
    const doc = new PDFDocument({ size: [288, 432] });
    res.setHeader("Content-Type", "application/pdf");

    doc.pipe(res);
    doc.image(labelaryResponse.data, 0, 0, { width: 288 });
    doc.end();

  } catch (error) {
    console.error(error);
    res.status(500).send("Erro na conversão");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PO
