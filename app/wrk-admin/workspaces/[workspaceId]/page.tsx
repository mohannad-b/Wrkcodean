import ClientDetailPage from "../../clients/[clientId]/page";

export default function WorkspaceDetailPage({ params }: { params: { workspaceId: string } }) {
  return <ClientDetailPage params={{ clientId: params.workspaceId }} />;
}

