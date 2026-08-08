# Ficha Online

## Rodar localmente

```powershell
npm install
npm start
```

Abra `http://localhost:3000`. O login e o salvamento de fichas dependem do servidor Node.

## Publicar no GitHub Pages

O workflow em `.github/workflows/deploy-pages.yml` publica automaticamente o frontend a cada push na branch `main`. No repositório, ative `Settings > Pages > Source: GitHub Actions`.

O GitHub Pages hospeda apenas arquivos estáticos. Para login, contas e fichas salvas, publique também `server.js` em um serviço Node e configure a URL da API em `window.API_BASE_URL` antes do `script.js`.