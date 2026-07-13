FROM node:22-alpine

# OCR 100% local para importar presupuestos escaneados:
#   - tesseract-ocr + datos de español (spa)  -> OCR
#   - poppler-utils (pdftoppm)                 -> PDF a imagen
RUN apk add --no-cache tesseract-ocr tesseract-ocr-data-spa poppler-utils

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 5000

CMD ["node", "src/app.js"]
