import type { Metadata } from "next";
import localFont from "next/font/local"; //em vez de fazer download no docker eu fiz e so vamos buscar a mao (../fonts/Quicksand-VariableFont_wght.ttf)
import "./globals.css";

import NavBar from "./components/navbar";
import Footer from "./components/footer";
import { UserProvider } from "@/context/AuthContext";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";


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

  return (
    <html
      lang="en"
      className={`${quicksand.className} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <UserProvider>
            <NavBar />
            <div className="background-image">
              {children}
            </div>
            <Footer />
          </UserProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}