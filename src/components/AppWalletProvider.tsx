import { WalletProvider, lightTheme } from '@mysten/dapp-kit';
import { useTheme } from '../context/ThemeContext';
import { ReactNode } from 'react';

const darkTheme = {
    blurs: {
        modalOverlay: "blur(0)"
    },
    backgroundColors: {
        primaryButton: "#1C2128",
        primaryButtonHover: "#30363D",
        outlineButtonHover: "#30363D",
        modalOverlay: "rgba(0, 0, 0, 0.9)",
        modalPrimary: "#21262D",
        modalSecondary: "#161B22",
        iconButton: "transparent",
        iconButtonHover: "#30363D",
        dropdownMenu: "#161B22",
        dropdownMenuSeparator: "#30363D",
        walletItemSelected: "#1C2128",
        walletItemHover: "#1C2128"
    },
    borderColors: {
        outlineButton: "#30363D"
    },
    colors: {
        primaryButton: "#E6EDF3",
        outlineButton: "#E6EDF3",
        iconButton: "#E6EDF3",
        body: "#E6EDF3",
        bodyMuted: "#8B949E",
        bodyDanger: "#FF794B"
    },
    radii: {
        small: "6px",
        medium: "8px",
        large: "12px",
        xlarge: "16px"
    },
    shadows: {
        primaryButton: "none",
        walletItemSelected: "none"
    },
    fontWeights: {
        normal: "400",
        medium: "500",
        bold: "600"
    },
    fontSizes: {
        small: "14px",
        medium: "16px",
        large: "18px",
        xlarge: "20px"
    },
    typography: {
        fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"',
        fontStyle: "normal",
        lineHeight: "1.3",
        letterSpacing: "1"
    }
};

export function AppWalletProvider({ children }: { children: ReactNode }) {
    const { theme } = useTheme();

    return (
        <WalletProvider theme={theme === 'dark' ? darkTheme : lightTheme}>
            {children}
        </WalletProvider>
    );
}
