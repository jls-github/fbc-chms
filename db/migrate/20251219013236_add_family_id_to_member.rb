class AddFamilyIdToMember < ActiveRecord::Migration[8.0]
  def change
    add_reference :members, :family, foreign_key: true
  end
end
