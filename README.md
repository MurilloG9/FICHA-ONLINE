# Ficha Online

## Rodar localmente

```powershell
npm install
npm start
```

Abra `http://localhost:3000`. O login e o salvamento de fichas dependem do servidor Node.

## Publicar no GitHub Pages

O workflow em `.github/workflows/deploy-pages.yml` publica automaticamente o frontend a cada push na branch `main`. No repositório, ative `Settings > Pages > Source: GitHub Actions`.

O GitHub Pages hospeda apenas arquivos estáticos. Para login, contas e fichas salvas, publique `server.js` em um serviço Node. O arquivo `render.yaml` deixa essa publicação pronta no Render no plano Free. Configure `ADMIN_USERNAME` e `ADMIN_PASSWORD` como variáveis secretas no serviço.

No plano Free, o armazenamento local do SQLite não é permanente e pode ser apagado após reinícios ou novos deploys. Para manter as contas definitivamente, será necessário um banco externo ou um disco persistente pago.

Use o [deploy direto no Render](https://render.com/deploy?repo=https://github.com/MurilloG9/FICHA-ONLINE) para criar a API a partir deste repositório.

Depois de publicar a API, coloque a URL dela em `window.API_BASE_URL` antes do `script.js` no `index.html` e no `RPG FICHA.html`. Para usar tudo em um único endereço, abra diretamente a URL do serviço Render, que também serve o frontend.