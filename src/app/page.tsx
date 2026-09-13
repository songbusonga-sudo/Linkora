import Studio from "@/components/studio";
import { published } from "@/lib/db";
import "./public-studio.css";
export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <div className="public-studio">
      <Studio initialTemplates={published()} />
    </div>
  );
}
