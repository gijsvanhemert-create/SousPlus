// Nederlandse notatie, overgenomen uit het prototype.
export const eur = (n: number) => "€" + Number(n).toFixed(2).replace(".", ",");
export const pct = (n: number) => Number(n).toFixed(1).replace(".", ",") + "%";

export const nowTime = () =>
  new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
export const dateStr = () => new Date().toLocaleDateString("nl-NL");
