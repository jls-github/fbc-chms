import MembersTable from '../../components/members_table.tsx';

export default function MembersInertia({
  members,
}: {
  members: Array<{
    id: number;
    name: string;
    teams_list: string;
    group_name: string;
    status: string;
  }>;
}) {

  const activeMembers = members.filter(member => member.status === "active");
  const prospectiveMembers = members.filter(member => member.status === "prospective");
  const guests = members.filter(member => member.status === "guest");
  const inactiveMembers = members.filter(member => member.status === "inactive");

  return (
    <>
      <div className="flex justify-between items-center">
        <h1 className="font-bold text-4xl">Members List</h1>
        <a href="/members/new" className="rounded-md px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white block font-medium">
          New Member
        </a>
      </div>
      <h2 className="font-semibold text-2xl mt-8 mb-4">Active Members</h2>
      <MembersTable members={activeMembers} />

      <h2 className="font-semibold text-2xl mt-8 mb-4">Prospective Members</h2>
      <MembersTable members={prospectiveMembers} />

      <h2 className="font-semibold text-2xl mt-8 mb-4">Guests</h2>
      <MembersTable members={guests} />

      <h2 className="font-semibold text-2xl mt-8 mb-4">Inactive Members</h2>
      <MembersTable members={inactiveMembers} /> 
    </>
  );
}
