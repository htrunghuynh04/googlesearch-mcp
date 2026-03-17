FROM python:3.12-slim

WORKDIR /app

# Install uv for fast dependency management
RUN pip install --no-cache-dir uv

# Copy dependency files
COPY pyproject.toml ./

# Install dependencies
RUN uv sync --frozen --no-dev

# Copy source code
COPY apollo/ ./apollo/
COPY apollo_client.py ./
COPY server_http.py ./

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# Expose port
EXPOSE 8080

# Run the server with uvicorn
CMD ["uvicorn", "server_http:app", "--host", "0.0.0.0", "--port", "8080"]
