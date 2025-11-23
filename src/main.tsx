import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

import { SuiClientProvider } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';

import { SUI_NETWORKS, NETWORK } from './constants';

import { ThemeProvider } from './context/ThemeContext';

import { AppWalletProvider } from './components/AppWalletProvider';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <ThemeProvider>
            <QueryClientProvider client={queryClient}>
                <SuiClientProvider networks={SUI_NETWORKS} defaultNetwork={NETWORK}>
                    <AppWalletProvider>
                        <App />
                    </AppWalletProvider>
                </SuiClientProvider>
            </QueryClientProvider>
        </ThemeProvider>
    </React.StrictMode>,
)
