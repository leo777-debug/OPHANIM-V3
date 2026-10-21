FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=1
WORKDIR /worker
COPY requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock && useradd -m worker && mkdir /models && chown worker /models
COPY panel.py analysts.py service.py ./
USER worker
EXPOSE 8081
CMD ["python", "service.py"]
