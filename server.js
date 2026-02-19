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

function decodeGRF(content) {
  // Extrai o bloco base64 do formato ~Z64:...
  const match = content.match(/~Z64:([A-Za-z0-9+/=]+)/);
  if (!match) return content; // se não for GRF, retorna como está

  const compressed = Buffer.from(match[1], "base64");
  const decompressed = zlib.inflateRawSync(compressed);
  return decompressed.toString("utf8");
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

      // Decodifica se for GRF
      zplContent = decodeGRF(zplContent);
      console.log("Após decode, primeiros 200 chars:", zplContent.substring(0, 200));

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
