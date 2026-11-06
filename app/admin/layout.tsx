export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <section className="premium-admin-workspace">{children}</section>;
}