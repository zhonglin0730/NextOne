import { useTranslation } from "react-i18next";
import { NavLink } from "react-router";

interface ProjectViewNavProps {
  projectId: string;
}

export function ProjectViewNav({ projectId }: ProjectViewNavProps) {
  const { t } = useTranslation();
  const items = [
    {
      end: true,
      label: t("project.viewOverview"),
      to: `/projects/${projectId}`,
    },
    {
      end: false,
      label: t("project.viewStructure"),
      to: `/projects/${projectId}/structure`,
    },
    {
      end: false,
      label: t("project.viewBoard"),
      to: `/projects/${projectId}/board`,
    },
  ] as const;

  return (
    <nav aria-label={t("project.viewsLabel")} className="project-view-nav">
      {items.map((item) => (
        <NavLink
          className={({ isActive }) =>
            isActive ? "project-view-link project-view-link-active" : "project-view-link"
          }
          end={item.end}
          key={item.to}
          to={item.to}
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
