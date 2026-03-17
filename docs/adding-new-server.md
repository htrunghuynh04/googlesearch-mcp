# Adding a New MCP Server

Tổng quan: 2 phases — **A. Scaffold** (dùng `/mcp-builder` skill), **B. Integrate**

---

## Phase A — Scaffold với Claude `/mcp-builder`

1. Mở Claude Code trong repo này
2. Chạy `/mcp-builder` → mô tả service API cần wrap
3. Claude sinh code MCP server vào thư mục tạm
4. Move code vào `servers/<tên-server>/`

---

## Phase B — Integrate vào monorepo

5. Đảm bảo server có `Dockerfile` hoạt động standalone
6. Tạo `env.example` với các biến môi trường cần thiết
7. Copy block mẫu từ `docker-compose.yml`, điều chỉnh:
   - `context:` → đường dẫn tới thư mục build (thường là `./servers/<tên>`)
   - `dockerfile:` → đường dẫn tới Dockerfile
   - `ports:` → port tiếp theo (8082, 8083, ...)
   - `env_file:` → `./servers/<tên>/.env`
8. Tạo `.env` từ `env.example`, điền giá trị
9. Test: `docker compose up <tên-server> --build`
10. Thêm hàng vào bảng Servers trong `README.md`

---

## Dockerfile patterns per language

### TypeScript

```dockerfile
FROM node:lts-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

### .NET

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine AS base
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src
COPY . .
RUN dotnet restore && dotnet publish -c Release -o /app/publish
FROM base
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
CMD ["dotnet", "YourApp.dll"]
```

### Python

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8080
CMD ["python", "main.py"]
```

---

## Port registry

| Port | Server |
|---|---|
| 8080 | azure-devops |
| 8081 | nois-mcp |
| 8082 | apollo-io |
| 8083 | next server |
