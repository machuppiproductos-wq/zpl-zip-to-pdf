const cors = require("cors");
const express = require("express");
const multer = require("multer");
const JSZip = require("jszip");
const PDFDocument = require("pdfkit");
const zlib = require("zlib");
const sharp = require("sharp");
const crypto = require("crypto");

const app = express();
app.use(cors());
const upload = multer();

const PARTNER_ID = 1221266;
const PARTNER_KEY = 'shpk756253597879624570546d4e696b4c5473777258586458797364616b7263';
const SANDBOX_HOST = 'https://openplatform.sandbox.test-stable.shopee.sg';

function gerarSign(path, timestamp, accessToken = '', shopId = '') {
  const baseString = PARTNER_ID + path + timestamp + accessToken + shopId;
  return crypto.createHmac('sha256', PARTNER_KEY).update(baseString).digest('hex');
}

app.get("/", (req, res) => {
  res.send("API ZPL ZIP → PDF rodando 🚀");
});

app.get("/auth-shopee", (req, res) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = gerarSign('/api/v2/shop/auth_partner', timestamp);
  const authUrl = `${SANDBOX_HOST}/api/v2/shop/auth_partner?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&redirect=https://retool.com`;
  res.redirect(authUrl);
});

app.get("/get-token", async (req, res) => {
  const code = req.query.code;
  const shopId = parseInt(req.query.shop_id);
  const timestamp = Math.floor(Date.now() / 1000);
  const path = '/api/v2/auth/token/get';
  const sign = gerarSign(path, timestamp);
  const url = `${SANDBOX_HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, shop_id: shopId, partner_id: PARTNER_ID })
    });
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/get-orders", async (req, res) => {
  const accessToken = req.query.access_token;
  const shopId = parseInt(req.query.shop_id);
  const timestamp = Math.floor(Date.now() / 1000);
  const path = '/api/v2/order/get_order_list';
  const sign = gerarSign(path, timestamp, accessToken, shopId);

  // Busca pedidos dos últimos 15 dias
  const timeFrom = Math.floor(Date.now() / 1000) - (15 * 24 * 60 * 60);
  const timeTo = Math.floor(Date.now() / 1000);

  const url = `${SANDBOX_HOST}${path}?partner_id=${PARTNER_ID}&timestamp=${timestamp}&sign=${sign}&access_token=${accessToken}&shop_id=${shopId}&time_range_field=create_time&time_from=${timeFrom}&time_to=${timeTo}&page_size=50&response_optional_fields=order_status`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function expand1bitTo8bit(bitmap) {
  const expanded = Buffer.alloc(bitmap.length * 8);
  for (let i = 0; i < bitmap.length; i++) {
    const byte = bitmap[i];
    for (let bit = 0; bit < 8; bit++) {
      expanded[i * 8 + bit] = (byte & (0x80 >> bit)) ? 0 : 255;
    }
  }
  return expanded;
}

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
          console.log(`GRF: ${width}x${height}`);
          const expanded = expand1bitTo8bit(bitmap);
          const png = await sharp(expanded, {
            raw: { width, height, channels: 1 }
          }).png().toBuffer();
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
