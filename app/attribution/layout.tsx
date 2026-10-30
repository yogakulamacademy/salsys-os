import './attribution-responsive.css';

export default function AttributionLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="attribution-responsive-scope">{children}</div>;
}
