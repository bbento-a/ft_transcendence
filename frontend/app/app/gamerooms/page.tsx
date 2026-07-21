import styles from "./page.module.css"
import Image from "next/image"

export default function Home() {
  return (
	<div className={styles.pageWrapper}>
		<div className={styles.wrapperFrame} />
		<div className={styles.wrapperFrame}>
			<div className={styles.textWrapper}>
				<div className={styles.noGameRooms}>No game rooms available at the moment!</div>
			</div>
		</div>
		<div className={styles.wrapperFrame}>
			<div className={styles.roomsSetting}></div>
			<button className={styles.buttonWrapper}>
				<Image className={styles.gameroomIcon} width={70} height={70} sizes="100vw" alt="" src="/gameroom.svg"/>
			</button>
		</div>
	</div>
  )
}
