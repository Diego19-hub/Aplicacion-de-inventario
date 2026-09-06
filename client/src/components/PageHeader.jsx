import { useLocation } from "react-router-dom";

import { ValuationMethodInfo } from "./ValuationMethodInfo.jsx";

export function PageHeader({ title, description, actions }) {
  const { pathname } = useLocation();
  const showValuationMethod = pathname === "/app/reports"
    || pathname === "/app/reports/inventory"
    || pathname === "/app/reports/movements"
    || pathname === "/app/alerts"
    || pathname === "/app/costs"
    || pathname === "/app/break-even";
  return <>
    <header className="page-header"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="page-header__actions">{actions}</div>}</header>
    {showValuationMethod && <ValuationMethodInfo />}
  </>;
}
