import type { Metadata } from "next";
import localFont from "next/font/local"; //em vez de fazer download no docker eu fiz e so vamos buscar a mao (../fonts/Quicksand-VariableFont_wght.ttf)
import "./globals.css";

import NavBar from "./components/navbar";
import Footer from "./components/footer";
import { UserProvider } from "@/context/AuthContext";
import { NavGuardProvider } from "@/context/NavGuardContext";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ViewTransitions } from "next-view-transitions";


/*
  Muda se isto so pq e feito a mao ent tens q apontar para aonde esta e ya e isso
 */
const quicksand = localFont({
  src: "../fonts/Quicksand-VariableFont_wght.ttf",
  display: "swap",
});

// Funcao em vez de objeto constante porque a descricao (a que aparece no
// separador e em quem partilhe o link) tambem segue o idioma escolhido. O
// titulo e o nome do produto, esse e igual em toda a parte.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");

  return {
    title: "WawaConnect",
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();
  // sem isto o html dizia sempre lang="en": os leitores de ecra liam paginas em
  // PT/DE com pronuncia inglesa e o browser oferecia traduzir uma pagina que ja
  // estava no idioma de quem a estava a ver
  const locale = await getLocale();

  // ViewTransitions liga a View Transitions API do browser as navegacoes do
  // Next: quem navegar com useTransitionRouter (ou o Link da biblioteca) faz o
  // browser congelar um snapshot da pagina antiga e anima-lo para a nova — por
  // isso nunca se ve um estado intermedio. A animacao em si vive no globals.css
  // (::view-transition-old/new).
  return (
    <ViewTransitions>
      <html
        lang={locale}
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