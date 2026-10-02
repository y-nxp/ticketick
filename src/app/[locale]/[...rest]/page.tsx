import { notFound } from "next/navigation";

/** Adresse sans route : la 404 de la langue, dans la mise en page du site. */
export default function CatchAll() {
  notFound();
}
