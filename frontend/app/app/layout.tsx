import type { Metadata } from "next";
import localFont from "next/font/local"; //em vez de fazer download no docker eu fiz e so vamos buscar a mao (../fonts/Quicksand-VariableFont_wght.ttf)
import "./globals.css";

import NavBar from "./components/navbar";
import Footer from "./components/footer";
import { UserProvider } from "@/context/AuthContext";
import { NavGuardProvider } from "@/context/NavGuardContext";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { ViewTransitions } from "next-view-transitions";


/*
  Muda se isto so pq e feito a mao ent tens q apontar para aonde esta e ya e isso
 */
const quicksand = localFont({ 
  src: "../fonts/Quicksand-VariableFont_wght.ttf",
  display: "swap",
});

export const metadata: Metadata = {
  title: "WawaConnect",
  description:
    "WawaConnect is a 4-connect game built for ft_transcendence, a project from 42 school curriculum",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();

  // ViewTransitions liga a View Transitions API do browser as navegacoes do
  // Next: quem navegar com useTransitionRouter (ou o Link da biblioteca) faz o
  // browser congelar um snapshot da pagina antiga e anima-lo para a nova — por
  // isso nunca se ve um estado intermedio. A animacao em si vive no globals.css
  // (::view-transition-old/new).
  return (
    <ViewTransitions>
      <html
        lang="en"
        className={`${quicksand.className} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <NextIntlClientProvider messages={messages}>
            <UserProvider>
              <NavGuardProvider>
                <NavBar />
                <div className="background-image">
                  {children}
                </div>
                <Footer />
              </NavGuardProvider>
            </UserProvider>
          </NextIntlClientProvider>
        </body>
      </html>
    </ViewTransitions>
  );
}