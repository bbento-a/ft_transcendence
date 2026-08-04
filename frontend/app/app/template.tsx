// Um template, ao contrario do layout, e REMONTADO em cada navegacao — e por
// isso que a animacao de fade corre em todas as mudancas de pagina. A navbar e
// o footer vivem no layout, fora disto, e ficam quietos durante a transicao.
//
// O div copia o flex do .background-image (o pai), senao meter-se no meio
// estragava o centramento que as paginas esperam.
export default function Template({ children }: { children: React.ReactNode }) {
	return <div className="page-fade">{children}</div>;
}
