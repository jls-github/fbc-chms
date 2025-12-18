import MembersTable from "../../components/members_table.tsx";
import MemberCard from "../../components/member_card.tsx";

import { useState } from "react";
import { Member } from "@/types/member.ts";

export default function MembersInertia({
  members,
}: {
  members: Array<Member>;
}) {
  const sortedMembers = members.sort((a, b) => a.lastName.localeCompare(b.lastName));

  const activeMembers = sortedMembers.filter((member) => member.status === "active");
  const prospectiveMembers = sortedMembers.filter(
    (member) => member.status === "prospective"
  );
  const guests = sortedMembers.filter((member) => member.status === "guest");
  const inactiveMembers = sortedMembers.filter(
    (member) => member.status === "inactive"
  );

  const [memberViewType, setMemberViewType] = useState("card");

  return (
    <>
      <div className="flex justify-between items-center">
        <h1 className="font-bold text-4xl">Members</h1>
        <a
          href="/members/new"
          className="rounded-md px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white block font-medium"
        >
          New Member
        </a>
      </div>
      <div>
        <label className="mr-4">
          <input
            type="radio"
            name="viewType"
            value="table"
            checked={memberViewType === "table"}
            onChange={() => setMemberViewType("table")}
            className="mr-1"
          />
          Table View
        </label>
        <label>
          <input
            type="radio"
            name="viewType"
            value="card"
            checked={memberViewType === "card"}
            onChange={() => setMemberViewType("card")}
            className="mr-1"
          />
          Card View
        </label>
      </div>

      {memberViewType === "table" ? (
        <div>
          <h2 className="font-semibold text-2xl mt-8 mb-4">Active Members</h2>
          <MembersTable members={activeMembers} />

          <h2 className="font-semibold text-2xl mt-8 mb-4">
            Prospective Members
          </h2>
          <MembersTable members={prospectiveMembers} />

          <h2 className="font-semibold text-2xl mt-8 mb-4">Guests</h2>
          <MembersTable members={guests} />

          <h2 className="font-semibold text-2xl mt-8 mb-4">Inactive Members</h2>
          <MembersTable members={inactiveMembers} />
        </div>
      ) : memberViewType === "card" ? (
        <div>
          <h2 className="font-semibold text-2xl mt-8 mb-4">Active Members</h2>
          <div
            id="active-members"
            className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-stretch"
          >
            {activeMembers.map((member) => (
              <MemberCard member={member} key={member.id} />
            ))}
          </div>
          <hr className="my-6" />
          <h2 className="font-semibold text-2xl mt-8 mb-4">Prospective Members</h2>
          <div
            id="prospective-members"
            className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-stretch"
          >
            {prospectiveMembers.map((member) => (
              <MemberCard member={member} key={member.id} />
            ))}
          </div>
          <hr className="my-6" />
          <h2 className="font-semibold text-2xl mt-8 mb-4">Guests</h2>
          <div
            id="guests"
            className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-stretch"
          >
            {guests.map((member) => (
              <MemberCard member={member} key={member.id} />
            ))}
          </div>
          <hr className="my-6" />
          <h2 className="font-semibold text-2xl mt-8 mb-4">Inactive Members</h2>
          <div
            id="inactive-members"
            className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 items-stretch"
          >
            {inactiveMembers.map((member) => (
              <MemberCard member={member} key={member.id} />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
