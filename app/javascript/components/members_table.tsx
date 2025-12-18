import { Member } from "@/types/member";

export default function MembersTable({
  members,
}: {
  members: Array<Member>;
}) {
  return (
    <table className="w-full divide-y divide-gray-200 table-fixed">
      <thead className="bg-gray-50">
        <tr>
          <th
            scope="col"
            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
          >
            Name
          </th>
          <th
            scope="col"
            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
          >
            Group
          </th>
          <th
            scope="col"
            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
          >
            Teams
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {members.map((member) => (
          <tr key={member.id}>
            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
              <a href={`/members/${member.id}`}>{member.name}</a>
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {member.groupName}
            </td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
              {member.teamsList}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
