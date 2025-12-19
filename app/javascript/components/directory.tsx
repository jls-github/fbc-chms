import { Member } from "@/types/member";

export default function Directory({
  membersByFamily }: {
  membersByFamily: Record<string, Array<Member>>}) {
    console.log(membersByFamily);
    console.log(Object.keys(membersByFamily));
  return (
    <div>
      {Object.keys(membersByFamily).sort((a, b) => {
        if (a == "No Family") {
          return 1
        }
        if (b == "No Family") {
          return -1
        }
        return a.localeCompare(b);
      }).map((familyName) => (
        <div key={familyName} className="mb-10">
          <h2 className="font-semibold text-2xl mb-4">{familyName}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {membersByFamily[familyName].map((member) => (
              <div
                key={member.id}
                className="border border-gray-300 rounded-lg p-4"
              >
                <h3 className="font-medium text-lg mb-2">{member.name}</h3>
                <p className="text-sm text-gray-600 mb-1">
                  <strong>Phone:</strong> {member.phone}
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  <strong>Email:</strong> {member.email}
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  <strong>Birthdate:</strong> {member.birthdate}
                </p>
                <a
                  href={`/members/${member.id}`}
                  className="text-blue-600 hover:underline text-sm"
                >
                  View Member
                </a>
              </div>
            ))}
          </div>
        </div>
      ))}

    </div>
  );
}