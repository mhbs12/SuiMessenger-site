# SuiMessenger

Aplicação de mensagens descentralizada construída no ecossistema Sui com criptografia end-to-end usando SEAL e armazenamento Walrus.

## 🚀 Deploy na Vercel

### Opção 1: Via Dashboard (Recomendado)

1. Acesse [vercel.com](https://vercel.com)
2. Faça login com GitHub
3. Clique em **"New Project"**
4. Importe o repositório `mhbs12/SuiMessenger-site`
5. Configure:
   - **Framework Preset:** Vite
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`

6. **Adicione as Environment Variables:**
   ```
   VITE_SUI_NETWORK=testnet
   VITE_PACKAGE_ID=<seu_package_id>
   VITE_CHAT_REGISTRY_ID=<seu_registry_id>
   VITE_SEAL_KEY_SERVER_1=<key_server_1>
   VITE_SEAL_KEY_SERVER_2=<key_server_2>
   VITE_SEAL_THRESHOLD=<threshold>
   VITE_SEAL_SESSION_TTL_MINUTES=<ttl>
   ```

7. Clique em **"Deploy"** ✅

### Opção 2: Via CLI

```bash
# Instalar Vercel CLI
npm i -g vercel

# Deploy
vercel

# Adicionar variáveis de ambiente
vercel env add VITE_SUI_NETWORK production
vercel env add VITE_PACKAGE_ID production
# ... adicione as outras variáveis
```

## 🔧 Desenvolvimento Local

```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev

# Build de produção
npm run build

# Preview do build
npm run preview
```

## 📦 Variáveis de Ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

## 🌐 Domínio Personalizado

Após o deploy na Vercel:
1. Vá em **Settings → Domains**
2. Adicione seu domínio
3. Configure o DNS conforme instruções

## 🛠️ Stack Tecnológica

- **Frontend:** React + TypeScript + Vite
- **Blockchain:** Sui
- **Criptografia:** @mysten/seal (E2EE)
- **Armazenamento:** Walrus
- **Styling:** Tailwind CSS
- **Animações:** Framer Motion
- **Wallet:** @mysten/dapp-kit

## 📝 Notas

- O arquivo `vercel.json` já está configurado com headers necessários para WASM
- Deploy automático acontece a cada push na branch `main`
- Logs e analytics disponíveis no dashboard da Vercel
