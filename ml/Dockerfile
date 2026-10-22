FROM python:3.12-slim
WORKDIR /extractor
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-eng tesseract-ocr-ara && rm -rf /var/lib/apt/lists/*
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY scripts/extract_document.py scripts/extraction_server.py scripts/knowledge_worker.py ./
RUN useradd --uid 1001 --no-create-home extractor
USER extractor
EXPOSE 8088
CMD ["python", "extraction_server.py"]
