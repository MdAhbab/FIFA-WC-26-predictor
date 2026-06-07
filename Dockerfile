# ---------------------------------------------------------------------------
# Stage 1 — build the React/Vite frontend
# ---------------------------------------------------------------------------
FROM node:20-slim AS frontend
WORKDIR /app/frontend

# Install deps first (better layer caching)
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install

# Build. Ad env vars can be injected at build time (VITE_* are baked into the bundle).
COPY frontend/ ./
ARG VITE_ADSENSE_CLIENT=""
ARG VITE_AD_SLOT_LEADERBOARD=""
ARG VITE_AD_SLOT_RECTANGLE=""
ARG VITE_AD_SLOT_IN_ARTICLE=""
ENV NODE_OPTIONS="--max-old-space-size=512"
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Python runtime (serves API + built frontend on one port)
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8090

WORKDIR /app

# Backend deps
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Backend source + datasets
COPY backend/ ./backend/
# Built frontend from stage 1 (server.py serves ../frontend/dist)
COPY --from=frontend /app/frontend/dist ./frontend/dist

# Pre-train & cache the goal model at build time so container start is ~instant
# (the trained estimator is persisted to backend/model_cache).
RUN cd backend && python -c "import engine; engine.build()"

EXPOSE 8090

# Single worker on purpose: the model, prediction cache, sessions and continual-learning
# state are in-process and shared. Concurrency is handled by the async threadpool + warm cache.
WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8090} --workers 1 --log-level info"]
