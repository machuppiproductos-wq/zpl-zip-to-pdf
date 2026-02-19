const cors = require("cors");
const express = require("express");
const multer = require("multer");
const JSZip = require("jszip");
const PDFDocument = require("pdfkit");
const axios = require("axios");
const zlib = require("zlib");

const app = express();
app.use(cors());
const upload = multer();

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function decodeZ64(content) {
  try {
    const match = content.match(/:Z64:([A-Za-z0-9+/=]+)/);
    if (!match) {
      console.log("Não encontrou Z64, retornando original");
      return content;
    }
    const compressed = Buffer.from(match[1], "base64");
    console.log("Buffer size:", compressed.length);
    const decompressed = zlib.inflateSync(compressed);
    const result = decompressed.toString("utf8");
    console.log("Decompressed primeiros 200:", result.substring(0, 200));
    return result;
  } catch (e) {
    console.error("Erro no decode Z64:", e.message);
    return content;
  }
}

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
      let zplContent = await zip.files[fileName].async("string");
      zplContent = decodeZ64(zplContent);

      const labels = zplContent.match(/\^XA[\s\S]*?\^XZ/gi) || [zplContent];
      console.log("Total de etiquetas:", labels.length);

      for (const label of labels) {
        try {
          await sleep(300);
          const labelaryResponse = await axios.post(
            "http://api.labelary.com/v1/printers/8dpmm/labels/4x6/0/",
            label.trim(),
            {
              responseType: "arraybuffer",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "image/png"
              }
            }
          );
          images.push(labelaryResponse.data);
        } catch (e) {
          console.error("Erro numa etiqueta:", e.message);
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
