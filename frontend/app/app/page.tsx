import Login from "./log_in/page"

export default function landingPage() {
  // middleware.ts já garante que só chegam aqui utilizadores sem sessão válida
  return (Login());
}
