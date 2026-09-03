import { createRoot } from "react-dom/client";
import "./index.css";

const root = createRoot(document.getElementById("root")!);
const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
const isPublicSupporterRoute = normalizedPath === "/1470" || normalizedPath === "/apoiadores/avatar";

async function bootstrap() {
  if (isPublicSupporterRoute) {
    const [{ default: SupporterAvatar1470 }, { Toaster }] = await Promise.all([
      import("./pages/SupporterAvatar1470V2"),
      import("@/components/ui/toaster"),
    ]);

    root.render(
      <>
        <SupporterAvatar1470 />
        <Toaster />
      </>,
    );
    return;
  }

  await Promise.all([
    import("./neural.css"),
    import("./approved-concept.css"),
  ]);
  const { default: App } = await import("./App.tsx");
  root.render(<App />);
}

void bootstrap();
