import styles from "./matching.module.css";

export function MatchingAttribution({ original = false }: { original?: boolean }) {
  return (
    <div className={styles.attribution}>
      <a href="https://skiper-ui.com/v1/skiper39" target="_blank" rel="noreferrer">Skiper UI</a>
      <span> / </span>
      {original ? (
        <a href="https://www.openpeeps.com/" target="_blank" rel="noreferrer">Open Peeps</a>
      ) : (
        <a href="https://www.dicebear.com/styles/notionists/" target="_blank" rel="noreferrer">Notionists</a>
      )}
    </div>
  );
}
