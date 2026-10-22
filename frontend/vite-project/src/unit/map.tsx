import AppLayout from "../components/AppLayout";
import AssignmentMap from "../components/AssignmentMap";
import { UnitGate } from "../components/UnitGate";
import { Empty, ErrorBox, Loading } from "../components/ui";
import { useMyUnit } from "../hooks/useMyUnit";
import { useFetch } from "../hooks/useFetch";
import { useLive } from "../context/SocketContext";
import { api } from "../api/client";
import type { EmergencyRequest } from "../api/types";

const UnitMap = () => {
  const u = useMyUnit();
  const { data, loading, error, reload } = useFetch(async () => (await api.get("/units/emergencies/assigned")).data.requests as EmergencyRequest[]);
  useLive(["assignment:new", "emergency:updated", "resync"], () => void reload(true));
  const r = data?.[0];
  return (
    <AppLayout title="Map & Route">
      <UnitGate loading={u.loading} error={u.error} needsRegistration={u.needsRegistration} unit={u.unit} reload={() => void u.reload()}>
        {loading && <Loading />}
        {error && <ErrorBox message={error} onRetry={() => void reload()} />}
        {data && !r && <div className="box"><Empty icon="🗺️" title="No destination" hint="The route to the incident appears here once you have an assignment." /></div>}
        {r && <div className="box"><h3>Route to {r.referenceId}</h3><AssignmentMap request={r} height={520} /></div>}
      </UnitGate>
    </AppLayout>
  );
};

export default UnitMap;
