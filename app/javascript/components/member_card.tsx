import { Member } from "@/types/member";

export default function MemberCard({
  member,
}: {
  member: Member;
}) {
  return (
    <div id={`member-${member.id}`} className="w-full sm:w-auto my-5">
      <div className="card flex flex-col h-full">
        <div className="card-title">{member.name}</div>
        <div className="flow-y flex-1 min-h-0">
          <div>
            <strong className="block font-medium mb-1">
              Community Group:{" "}
            </strong>
            <div className="text-sm gray-700">{member.groupName}</div>
          </div>
          <div>
            <strong className="block font-medium mb-1">Teams: </strong>
            <div className="text-sm gray-700">{member.teamsList}</div>
          </div>
          <div>
            <a
              href={`/members/${member.id}`}
              className="rounded-md px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white block font-medium text-center"
            >
              View Member
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
